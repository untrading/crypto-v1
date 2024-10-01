// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.8;

import { ERC721MetadataStorage } from '@solidstate/contracts/token/ERC721/metadata/ERC721MetadataStorage.sol';
import { IERC165 } from "@solidstate/contracts/interfaces/IERC165.sol";
import { ERC165BaseStorage } from "@solidstate/contracts/introspection/ERC165/base/ERC165BaseStorage.sol";
import { IERC721 } from "@solidstate/contracts/interfaces/IERC721.sol";
import { IERC20Metadata } from "@solidstate/contracts/token/ERC20/metadata/IERC20Metadata.sol";
import "@drad/eip-5173-diamond/contracts/nFR/InFR.sol";

import { IDiamondReadable } from '@solidstate/contracts/proxy/diamond/readable/IDiamondReadable.sol';
import { OwnableStorage } from '@solidstate/contracts/access/ownable/OwnableStorage.sol';
import { Proxy } from '@solidstate/contracts/proxy/Proxy.sol';

import { WrappingStorage } from "../wrapping/WrappingStorage.sol";
import { UnwrappingStorage } from "../unwrapping/UnwrappingStorage.sol";
import "../management/ManagementStorage.sol";

contract unCryptoProxy is Proxy {
    address private immutable UNCRYPTO_DIAMOND;

    using ERC165BaseStorage for ERC165BaseStorage.Layout;

    constructor(
        address unCryptoDiamond,
        address underlyingToken,
        address untradingManager,
        uint256 managerCut,
        string memory name,
        string memory symbol,
        string memory baseURI
    ) {
        require(managerCut == 1e18, "managerCut is not 100%"); // Can be pruned in the future

        // Init Diamond Proxy
        UNCRYPTO_DIAMOND = unCryptoDiamond;

        // Init Ownable
        OwnableStorage.layout().owner = msg.sender; // If we want to incorporate ownability into each individual proxy, probably unnecessary since we have the untradingManager

        // Init the ERC721 Metadata for the unCrypto Proxy
        ERC721MetadataStorage.Layout storage l = ERC721MetadataStorage.layout();
        l.name = name;
        l.symbol = symbol;
        l.baseURI = baseURI;

        // Declare all interfaces supported by the Diamond
        ERC165BaseStorage.layout().supportedInterfaces[type(IERC165).interfaceId] = true;
        ERC165BaseStorage.layout().supportedInterfaces[type(IERC721).interfaceId] = true;
        ERC165BaseStorage.layout().supportedInterfaces[type(InFR).interfaceId] = true;

        // Init the WrappingStorage and set underlying token
        WrappingStorage.Layout storage w = WrappingStorage.layout();
        w.underlyingTokenAddress = underlyingToken;
        w.underlyingTokenDecimals = IERC20Metadata(underlyingToken).decimals();

        assert(w.underlyingTokenDecimals > 0 && w.underlyingTokenDecimals <= 18);

        // Init EIP-712
        UnwrappingStorage.Layout storage u = UnwrappingStorage.layout();
        u.DOMAIN_SEPARATOR = keccak256(abi.encode(UnwrappingStorage.EIP712DOMAINTYPE_HASH, keccak256(bytes(name)), UnwrappingStorage.VERSION_HASH, block.chainid, address(this), UnwrappingStorage.SALT));

        // Init the manager and managerCut used by oTokens
        ManagementStorage.Layout storage m = ManagementStorage.layout();
        m.untradingManager = untradingManager;
        m.managerCut = managerCut;
    }

    function _getImplementation() internal view override returns (address) {
        return IDiamondReadable(UNCRYPTO_DIAMOND).facetAddress(msg.sig);
    }

    receive() external payable {}
}