// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.8;

import "../management/ManagementStorage.sol";

contract MockFacet {
    function MockFunc() external pure returns (string memory) {
        return _mockFunc();
    }

    function _mockFunc() internal pure returns (string memory) {
        return "Hello unDiamond";
    }

    function setManagerCut(uint256 /*newManagerCut*/) external {
        ManagementStorage.Layout storage m = ManagementStorage.layout();
        
        m.managerCut = 0.4e18;
    }
}