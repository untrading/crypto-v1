// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.8;

library UnwrappingStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("untrading.unCryptoDiamond.facet.ERC20.unwrapping.storage");

    bytes32 constant EIP712DOMAINTYPE_HASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)");

    bytes32 constant VERSION_HASH = keccak256("1");

    bytes32 constant TXTYPE_HASH = keccak256("Unwrap(address to,uint256 tokenId)");

    // keccak256("untradingcrypto")
    bytes32 constant SALT = 0xc25ebea6dd97ec30f15ce845010d7e9fee0398194f29ee544b5062c074544590;

    struct Layout {
        bytes32 DOMAIN_SEPARATOR;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}
