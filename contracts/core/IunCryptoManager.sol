// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.8;

interface IunCryptoManager {

    event unCryptoProxyDeployed(address deployment);

    function UNCRYPTO_DIAMOND() external view returns (address);

    function getProxy(address underlyingToken) external view returns (address proxy);

    function getProxyList() external view returns (address[] memory proxyList);

    function deployCryptoProxy(address underlyingToken, address untradingManager, uint256 managerCut, string memory name, string memory symbol, string memory baseURI) external returns (address deployment);

}