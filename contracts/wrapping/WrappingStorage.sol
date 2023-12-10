// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.8;

library WrappingStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("untrading.unCryptoDiamond.facet.ERC20.wrapping.storage");

    struct Layout {
        // Every token in this contract is assumed to be wrapped, so there is no need for another underlyingAmount variable or an isWrapped bool.
        address underlyingTokenAddress;
        uint8 underlyingTokenDecimals;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}
