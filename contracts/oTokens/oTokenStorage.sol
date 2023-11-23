// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.8;

library oTokenStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("untrading.unCryptoDiamond.facet.otokens.storage");

    struct oToken {
        uint256 ORatio; // The percentage of the profit
        uint256 rewardRatio; // The percentage of profit allocated to both FR and OR
        address paymentToken; // The address of the ERC20 token being used for payments or address(0) for chain native token.
        address[] holders; // The addresses receiving the oToken cut of profit
        mapping(address => uint256) amount; // The amount of tokens each holder has
    }

    struct Layout {
        // It will be quite easy to solve our current issue, we create a mapping that is uint256 => oToken, then we assign a variable (oTokenId) or mapping for uint256 => uint256, this would be the tokenId => oTokenId, then we just pull the oTokenId to get the oToken struct. 2 calls to get the oToken info, we don't need to change anything as we can make the oTokenId the same as the tokenId during mint time, so in the future, different split tokens will have the same oTokenId which is just the original tokenId

        mapping(uint256 => oToken) _oTokens; // Mapping that represents the oToken information for a given oTokenId

        mapping(uint256 => uint256) _oTokenId; // Mapping that represents the tokenId => oTokenId

        mapping(address => uint256) _allottedOR; // Mapping that represents the OR (in Ether) allotted for a given address

        mapping(address => mapping(address => uint256)) _allottedERC20Tokens; // Mapping that represents the FR + OR allotted for a given address and in which token
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}
