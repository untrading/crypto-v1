// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.8;

library unCryptoManagerStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("untrading.Core.unCryptoManager.facet.storage");

    struct Layout {
        mapping(address => address) proxyAddresses; // Mapping that represents a given token's proxy/derivative contract
        address[] proxyList; // List of all created proxies
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }

    function getProxy(Layout storage l, address underlyingToken) internal view returns (address) {
        return l.proxyAddresses[underlyingToken];
    }

    function setProxy(Layout storage l, address underlying, address proxy) internal {
        l.proxyAddresses[underlying] = proxy;
    }
}
