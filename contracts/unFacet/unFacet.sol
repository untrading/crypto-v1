// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.8;

import { SolidStateERC721 } from "@solidstate/contracts/token/ERC721/SolidStateERC721.sol";
import { ERC721MetadataStorage } from "@solidstate/contracts/token/ERC721/metadata/ERC721MetadataStorage.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

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

    using SafeERC20 for IERC20;
    using PRBMathUD60x18 for uint256;

    function getORInfo(uint256 tokenId) external view override returns (uint256 ORatio, uint256 rewardRatio, address paymentToken, address[] memory holders) {
        oTokenStorage.Layout storage o = oTokenStorage.layout();

        oTokenStorage.oToken storage oToken = o._oTokens[o._oTokenId[tokenId]];

        return (oToken.ORatio, oToken.rewardRatio, oToken.paymentToken, oToken.holders);
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

    function _mint(
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
        WrappingStorage.Layout storage w = WrappingStorage.layout();

        uint256 adjustedTokenAmount = tokenAmount * (10 ** (18 - w.underlyingTokenDecimals)); // Adjust the decimals of the token to ensure that the token amounts are always in 18 decimals.

        uint256 tokenId = _mint(to, adjustedTokenAmount, paymentToken, numGenerations, rewardRatio, ORatio);

        IERC20(w.underlyingTokenAddress).safeTransferFrom(_msgSender(), address(this), tokenAmount);

        emit Wrapped(to, tokenAmount, paymentToken);

        return tokenId;
    }

    function unwrap(address to, uint256 tokenId, uint8 sigV, bytes32 sigR, bytes32 sigS) external override {
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
        uint256 amount = n._tokenAssetInfo[tokenId].amount / (10 ** (18 - w.underlyingTokenDecimals)); // Remove any additional decimals the contract might have added

        _burn(tokenId);

        IERC20(underlyingTokenAddress).safeTransfer(to, amount);

        emit Unwrapped(tokenId, amount);
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

        IERC20(token).safeTransfer(account, paymentAmount);

        emit ERC20RewardsClaimed(account, token, paymentAmount);
    }

    function transferOTokens(address to, uint256 tokenId, uint256 amount) external override {
        oTokenStorage.Layout storage o = oTokenStorage.layout();

        require(to != address(0), "transfer to the zero address");
        require(to != _msgSender(), "transfer to self");
        require(amount > 0, "transfer amount is 0");

        oTokenStorage.oToken storage oToken = o._oTokens[o._oTokenId[tokenId]];

        uint256 fromBalance = oToken.amount[_msgSender()];
        require(fromBalance >= amount, "transfer amount exceeds balance");

        unchecked {
            oToken.amount[_msgSender()] = fromBalance - amount;
            // Overflow not possible: the sum of all balances is capped by 1e18 (100%), and is preserved by
            // decrementing then incrementing.
            oToken.amount[to] += amount;
        }

        if (fromBalance - amount == 0) {
            for (uint256 i = 0; i < oToken.holders.length; i++) {
                if (oToken.holders[i] == _msgSender()) {
                    oToken.holders[i] = to;
                    return;
                }
            }
            revert("Not Found");
        } else {
            oToken.holders.push(to);
        }

        emit OTokenTransfer(_msgSender(), to, tokenId);
    }

    function _distributeOTokens(address to, uint256 tokenId, uint256 ORatio, uint256 rewardRatio, address paymentToken) internal {
        oTokenStorage.Layout storage o = oTokenStorage.layout();
        ManagementStorage.Layout storage m = ManagementStorage.layout();

        oTokenStorage.oToken storage oToken = o._oTokens[tokenId];

        o._oTokenId[tokenId] = tokenId; // Set the oTokenId for the token for identification
        
        oToken.ORatio = ORatio;
        oToken.rewardRatio = rewardRatio;
        oToken.paymentToken = paymentToken;
        oToken.holders = [m.untradingManager, to];
        oToken.amount[m.untradingManager] = m.managerCut;
        oToken.amount[to] = (1e18 - m.managerCut);

        emit OTokensDistributed(tokenId);
    }

    function _distributeOR(uint256 tokenId, uint256 profit) internal returns(uint256 allocatedOR) {
        oTokenStorage.Layout storage o = oTokenStorage.layout();

        oTokenStorage.oToken storage oToken = o._oTokens[o._oTokenId[tokenId]];

        uint256 ORAvailable = profit.mul(oToken.ORatio);

        for (uint holder = 0; holder < oToken.holders.length; holder++) {
            address holderAddress = oToken.holders[holder];

            if (oToken.paymentToken == address(0)) {
                o._allottedOR[holderAddress] += ORAvailable.mul(oToken.amount[holderAddress]);
            } else {
                o._allottedERC20Tokens[holderAddress][oToken.paymentToken] += ORAvailable.mul(oToken.amount[holderAddress]);
            }
        }

        allocatedOR = ORAvailable;

        emit ORDistributed(tokenId, ORAvailable);
    }

    function _distributeFR(uint256 tokenId, uint256 profit) internal override returns(uint256 allocatedFR) {
        uint256 allocatedOR = _distributeOR(tokenId, profit);
        uint256 allocated = super._distributeFR(tokenId, profit);

        allocatedFR = (allocated + allocatedOR);
    }

    function buy(uint256 tokenId, uint256 amount) public payable virtual override {
        oTokenStorage.Layout storage o = oTokenStorage.layout();

        oTokenStorage.oToken storage oToken = o._oTokens[o._oTokenId[tokenId]];

        if (oToken.paymentToken == address(0)) {
            super.buy(tokenId, amount);
        } else {
            nFRStorage.Layout storage l = nFRStorage.layout();

            uint256 transactionValue = (amount).mul(l._tokenListInfo[tokenId].salePrice); // Sale price should be determined based on the amount supplied into the buy function, (buyAmount) * salePrice

            IERC20(oToken.paymentToken).safeTransferFrom(_msgSender(), address(this), transactionValue); //* Need to assess if calling transferFrom here is the best approach, versus a more complete refactor for safety reasons. We could convert _payLister to a pull-payment system in both nFR for ETH and here for ERC20, and then we would be able to call IERC20.transferFrom at the end of this buy override.

            _buy(tokenId, amount, true);
        }
    }

    function _payLister(uint256 tokenId, address lister, uint256 paymentAmount) internal virtual override {
        oTokenStorage.Layout storage o = oTokenStorage.layout();

        oTokenStorage.oToken storage oToken = o._oTokens[o._oTokenId[tokenId]];

        if (oToken.paymentToken == address(0)) {
            super._payLister(tokenId, lister, paymentAmount);
        } else {
            IERC20(oToken.paymentToken).safeTransfer(lister, paymentAmount); // Since _payLister is only called when soldPrice > 0, you will never be transferring 0. 
        }
    }

    function _allocateFR(uint256 tokenId, address owner, uint256 FR) internal virtual override {
        oTokenStorage.Layout storage o = oTokenStorage.layout();

        oTokenStorage.oToken storage oToken = o._oTokens[o._oTokenId[tokenId]];

        if (oToken.paymentToken == address(0)) {
            super._allocateFR(tokenId, owner, FR);
        } else {
            oTokenStorage.layout()._allottedERC20Tokens[owner][oToken.paymentToken] += FR;
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
