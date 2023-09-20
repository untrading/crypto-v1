// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.8;

import { OwnableInternal } from '@solidstate/contracts/access/ownable/OwnableInternal.sol';
import { IunCryptoManager } from "./IunCryptoManager.sol";
import { unCryptoProxy } from "../proxy/unCryptoProxy.sol";

import { unCryptoManagerStorage } from "./unCryptoManagerStorage.sol";

contract unCryptoManager is IunCryptoManager, OwnableInternal {
    using unCryptoManagerStorage for unCryptoManagerStorage.Layout;

    address public immutable UNCRYPTO_DIAMOND;

    constructor(address unDiamond) { //? Could put the untradingManager and managerCut in the constructor
        UNCRYPTO_DIAMOND = unDiamond;
    }

    function getProxy(address underlyingToken) external view returns (address proxy) {
        proxy = unCryptoManagerStorage.layout().getProxy(underlyingToken);
    }

    function getProxyList() external view returns (address[] memory proxyList) {
        proxyList = unCryptoManagerStorage.layout().proxyList;
    }   

    function deployCryptoProxy(
        address underlyingToken,
        address untradingManager, 
        uint256 managerCut,
        string memory name,
        string memory symbol,
        string memory baseURI
    ) external onlyOwner returns (address deployment) {
        unCryptoManagerStorage.Layout storage m = unCryptoManagerStorage.layout();

        deployment = address(
            new unCryptoProxy(
                UNCRYPTO_DIAMOND,
                underlyingToken,
                untradingManager,
                managerCut,
                name,
                symbol,
                baseURI
            )
        );

        m.setProxy(underlyingToken, deployment);
        m.proxyList.push(deployment);

        emit unCryptoProxyDeployed(deployment);
    }
}