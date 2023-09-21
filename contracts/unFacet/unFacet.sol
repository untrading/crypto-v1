// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.8;

import {SolidStateERC721} from "@solidstate/contracts/token/ERC721/SolidStateERC721.sol";
import {ERC721MetadataStorage} from "@solidstate/contracts/token/ERC721/metadata/ERC721MetadataStorage.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

import "@prb/math/contracts/PRBMathUD60x18.sol";

import "lib/ERC5173-Divisible-Diamond/contracts/nFR/nFR.sol";

// import { CounterStorage } from "../utils/CounterStorage.sol"; //? Do we want to use the nFR CounterStorage or our own? Basically the only difference is storage slot location.

import "../oTokens/oTokenStorage.sol";
import "../wrapping/WrappingStorage.sol";
import { UnwrappingStorage } from "../unwrapping/UnwrappingStorage.sol";

import "../management/Management.sol";
import "./IunFacet.sol";

contract unFacet is nFR, Management, IunFacet {
    using CounterStorage for CounterStorage.Layout;

    using PRBMathUD60x18 for uint256;

    function getORInfo(uint256 tokenId) external view override returns (uint256 ORatio, uint256 rewardRatio, address paymentToken, address[] memory holders) {
        oTokenStorage.Layout storage o = oTokenStorage.layout();

        uint256 oTokenId = o._oTokenId[tokenId];

        return (o._oTokens[oTokenId].ORatio, o._oTokens[oTokenId].rewardRatio, o._oTokens[oTokenId].paymentToken, o._oTokens[oTokenId].holders);
    }

    function getAllottedOR(address account) external view override returns (uint256) {
        oTokenStorage.Layout storage o = oTokenStorage.layout();
        return (o._allottedOR[account]);
    }

    function getAllottedTokens(address account, address token) external view override returns (uint256) {
        return (oTokenStorage.layout()._allottedERC20Tokens[account][token]);
    }

    function balanceOfOTokens(uint256 tokenId, address account) external view override returns (uint256) {
        oTokenStorage.Layout storage o = oTokenStorage.layout();

        uint256 oTokenId = o._oTokenId[tokenId];

        return (o._oTokens[oTokenId].amount[account]);
    }

    function getUnderlyingTokenAddress() external view override returns (address) {
        WrappingStorage.Layout storage w = WrappingStorage.layout();
        return (w.underlyingTokenAddress);
    }

    function mint(
        address to,
        uint256 amount,
        address paymentToken,
        uint8 numGenerations,
        uint256 rewardRatio,
        uint256 ORatio
    ) internal returns(uint256 tokenId) { 
        require(numGenerations >= 5 && numGenerations <= 20, "numGenerations must be between 5 and 20");
        require(rewardRatio >= 5e16 && rewardRatio <= 5e17, "rewardRatio must be between 5% and 50%");
        require(ORatio >= 5e16 && ORatio <= 5e17, "ORatio must be between 5% and 50%");

        uint256 successiveRatio = ((uint256(numGenerations) * 1e18).div((uint256(numGenerations) * 1e18) - 1.618e18)) / 100 * 100; // by ( / 100 * 100) we are effectively rounding down the successive ratio. The division takes advantage of Solidity's automatic decimal truncation, effectively removing the last 2 digits, then the multiplication adds those 2 digits back as 0s.
        uint256 percentOfProfit = rewardRatio.mul(1e18 - ORatio);

        ORatio = rewardRatio.mul(ORatio);

        CounterStorage.incrementTokenId();

        uint256 newTokenId = CounterStorage.layout().tokenIds;
        _distributeOTokens(to, newTokenId, ORatio, rewardRatio, paymentToken);
        _mint(to, newTokenId, amount, numGenerations, percentOfProfit, successiveRatio);

        tokenId = newTokenId;
    }

    function wrap(
        address to,
        uint256 tokenAmount,
        address paymentToken,
        uint8 numGenerations,
        uint256 rewardRatio,
        uint256 ORatio
    ) external override returns(uint256) {
        uint256 tokenId = mint(to, tokenAmount, paymentToken, numGenerations, rewardRatio, ORatio);

        WrappingStorage.Layout storage w = WrappingStorage.layout();

        IERC20(w.underlyingTokenAddress).transferFrom(_msgSender(), address(this), tokenAmount);

        return tokenId;
    }

    function unwrap(address to, uint256 tokenId, uint8 sigV, bytes32 sigR, bytes32 sigS) external override { // Add an additional param to signature to make it more distinct and unique - we could use ownerAmount from FRInfo, which would guarantee no signature reusability as it is constantly incrementing. Also, need to consider partial unwraps. Partial unwraps should be quite simple, we would just need to do l._tokenAssetInfo[tokenId].amount -= amount; just as we do when having a partial transfer in EIP5173 Divisible, and it shouldn't have any ill-effect. 
        nFRStorage.Layout storage n = nFRStorage.layout();
        WrappingStorage.Layout storage w = WrappingStorage.layout();

        require(_isApprovedOrOwner(_msgSender(), tokenId), "Caller is not owner of token");

        if (n._tokenFRInfo[tokenId].ownerAmount != 1) {
            UnwrappingStorage.Layout storage u = UnwrappingStorage.layout();

            bytes32 inputHash = keccak256(abi.encode(UnwrappingStorage.TXTYPE_HASH, to, tokenId));
            bytes32 totalHash = keccak256(abi.encodePacked("\x19\x01", u.DOMAIN_SEPARATOR, inputHash));

            address recovered = ecrecover(totalHash, sigV, sigR, sigS);

            ManagementStorage.Layout storage m = ManagementStorage.layout();
            oTokenStorage.Layout storage o = oTokenStorage.layout();

            uint256 oTokenId = o._oTokenId[tokenId];

            oTokenStorage.oToken storage oToken = o._oTokens[oTokenId];

            address largestOTokenHolder;

            for (uint i = 0; i < oToken.holders.length; i++) {
                if (oToken.amount[oToken.holders[i]] > oToken.amount[largestOTokenHolder]) { // Only forseeable problem is if the oToken holders are split or tied, e.g. [0.1, 0.45, 0.45] In this config only the middle address' sig would need be approved.
                    largestOTokenHolder = oToken.holders[i];
                }
            }

            require(recovered == m.untradingManager || recovered == largestOTokenHolder, "Invalid signature provided");
        }

        address underlyingTokenAddress = w.underlyingTokenAddress;
        uint256 amount = n._tokenAssetInfo[tokenId].amount;

        _burn(tokenId);

        IERC20(underlyingTokenAddress).transfer(to, amount);
    }

    function releaseOR(address payable account) external override {
        oTokenStorage.Layout storage o = oTokenStorage.layout();
        require(o._allottedOR[account] > 0, "No OR Payment due");

        uint256 ORAmount = o._allottedOR[account];

        o._allottedOR[account] = 0;

        (bool sent, ) = account.call{value: ORAmount}("");
        require(sent, "Failed to release OR");

        emit ORClaimed(account, ORAmount);
    }

    function releaseAllottedTokens(address account, address token) external override {
        oTokenStorage.Layout storage o = oTokenStorage.layout();
        require(o._allottedERC20Tokens[account][token] > 0, "No Payment due");

        uint256 paymentAmount = o._allottedERC20Tokens[account][token];

        o._allottedERC20Tokens[account][token] = 0;

        IERC20(token).transfer(account, paymentAmount);

        emit ERC20RewardsClaimed(account, token, paymentAmount);
    }

    function transferOTokens(address to, uint256 tokenId, uint256 amount) external override {
        oTokenStorage.Layout storage o = oTokenStorage.layout();

        require(to != address(0), "transfer to the zero address");
        require(to != _msgSender(), "transfer to self");
        require(amount > 0, "transfer amount is 0");

        uint256 oTokenId = o._oTokenId[tokenId];

        uint256 fromBalance = o._oTokens[oTokenId].amount[_msgSender()];
        require(fromBalance >= amount, "transfer amount exceeds balance");

        unchecked {
             o._oTokens[oTokenId].amount[_msgSender()] = fromBalance - amount;
            // Overflow not possible: the sum of all balances is capped by 1e18 (100%), and is preserved by
            // decrementing then incrementing.
             o._oTokens[oTokenId].amount[to] += amount;
        }

        if (fromBalance - amount == 0) {
            for (uint256 i = 0; i < o._oTokens[oTokenId].holders.length; i++) {
                if (o._oTokens[oTokenId].holders[i] == _msgSender()) {
                    o._oTokens[oTokenId].holders[i] = to;
                    return;
                }
            }
            revert("Not Found");
        } else {
            o._oTokens[oTokenId].holders.push(to);
        }

        emit OTokenTransfer(_msgSender(), to, tokenId);
    }

    function _distributeOTokens(address to, uint256 tokenId, uint256 ORatio, uint256 rewardRatio, address paymentToken) internal {
        oTokenStorage.Layout storage o = oTokenStorage.layout();
        ManagementStorage.Layout storage m = ManagementStorage.layout();

        o._oTokenId[tokenId] = tokenId;
        
        o._oTokens[tokenId].ORatio = ORatio;
        o._oTokens[tokenId].rewardRatio = rewardRatio;
        o._oTokens[tokenId].paymentToken = paymentToken;
        o._oTokens[tokenId].holders = [m.untradingManager, to];
        o._oTokens[tokenId].amount[m.untradingManager] = m.managerCut;
        o._oTokens[tokenId].amount[to] = (1e18 - m.managerCut);

        emit OTokensDistributed(tokenId);
    }

    function _distributeOR(uint256 tokenId, uint256 soldPrice, uint256 profit) internal returns(uint256 allocatedOR) {
        oTokenStorage.Layout storage o = oTokenStorage.layout();

        uint256 oTokenId = o._oTokenId[tokenId];

        address paymentToken = o._oTokens[oTokenId].paymentToken;

        uint256 ORAvailable = profit.mul(o._oTokens[oTokenId].ORatio);

        for (uint holder = 0; holder < o._oTokens[oTokenId].holders.length; holder++) {
            address holderAddress = o._oTokens[oTokenId].holders[holder];

            if (paymentToken == address(0)) {
                o._allottedOR[holderAddress] += ORAvailable.mul(o._oTokens[oTokenId].amount[holderAddress]);
            } else {
                o._allottedERC20Tokens[holderAddress][paymentToken] += ORAvailable.mul(o._oTokens[oTokenId].amount[holderAddress]);
            }
        }

        allocatedOR = ORAvailable;

        emit ORDistributed(tokenId, soldPrice, ORAvailable);
    }

    function _distributeFR(uint256 tokenId, uint256 soldPrice, uint256 profit) internal override returns(uint256 allocatedFR) {
        uint256 allocatedOR = _distributeOR(tokenId, soldPrice, profit);
        uint256 allocated = super._distributeFR(tokenId, soldPrice, profit);

        allocatedFR = (allocated + allocatedOR);
    }

    function buy(uint256 tokenId, uint256 amount) public payable virtual override {
        oTokenStorage.Layout storage o = oTokenStorage.layout();

        uint256 oTokenId = o._oTokenId[tokenId];

        address paymentToken = o._oTokens[oTokenId].paymentToken;

        if (paymentToken == address(0)) {
            super.buy(tokenId, amount);
        } else {
            nFRStorage.Layout storage l = nFRStorage.layout();

            uint256 salePrice = ((amount).div(l._tokenListInfo[tokenId].saleAmount)).mul(l._tokenListInfo[tokenId].salePrice); // Sale price should be determined based on the amount supplied into the buy function, (buyAmount/saleAmount) * salePrice

            IERC20(paymentToken).transferFrom(_msgSender(), address(this), salePrice); //* Need to assess if calling transferFrom here is the best approach, versus a more complete refactor for safety reasons. We could convert _payLister to pull payment in both nFR and here, and then we would be able to call IERC20.transferFrom at the end of this buy override.

            _buy(tokenId, amount, true);
        }
    }

    function _payLister(uint256 tokenId, address lister, uint256 paymentAmount) internal virtual override {
        oTokenStorage.Layout storage o = oTokenStorage.layout();

        uint256 oTokenId = o._oTokenId[tokenId];

        address paymentToken = o._oTokens[oTokenId].paymentToken;

        if (paymentToken == address(0)) {
            super._payLister(tokenId, lister, paymentAmount);
        } else {
            IERC20(paymentToken).transfer(lister, paymentAmount); // Since _payLister is only called when soldPrice > 0, you will never be transferring 0. 
        }
    }

    function _allocateFR(uint256 tokenId, address owner, uint256 FR) internal virtual override {
        oTokenStorage.Layout storage o = oTokenStorage.layout();

        uint256 oTokenId = o._oTokenId[tokenId];

        address paymentToken = o._oTokens[oTokenId].paymentToken;

        if (paymentToken == address(0)) {
            super._allocateFR(tokenId, owner, FR);
        } else {
            oTokenStorage.layout()._allottedERC20Tokens[owner][paymentToken] += FR; 
        }
    }

    function _createSplitToken(address to, uint256 tokenId, uint256 amount, uint256 soldPrice) internal virtual override returns (uint256) {
        uint256 newTokenId = super._createSplitToken(to, tokenId, amount, soldPrice);

        oTokenStorage.Layout storage o = oTokenStorage.layout();
        
        o._oTokenId[newTokenId] = o._oTokenId[tokenId];

        return newTokenId;
    }

    function _burn(uint256 tokenId) internal override {
        super._burn(tokenId);
        oTokenStorage.Layout storage o = oTokenStorage.layout();

        delete o._oTokenId[tokenId];
    }
}
