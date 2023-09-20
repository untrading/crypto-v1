// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.8;

import "@solidstate/contracts/interfaces/IERC165.sol";

/*
 *
 * @dev Interface for the untrading unFacet.
 *
 */
interface IunFacet is IERC165 {

    event ORClaimed(address indexed account, uint256 indexed amount);

    event ERC20RewardsClaimed(address indexed account, address indexed token, uint256 indexed amount);

    event ORDistributed(uint256 indexed tokenId, uint256 indexed soldPrice, uint256 indexed allocatedFR);

    event OTokenTransfer(address indexed from, address indexed to, uint256 indexed tokenId);

    event OTokensDistributed(uint256 indexed tokenId);

    function wrap(address to, uint256 tokenAmount, address paymentToken, uint8 numGenerations, uint256 rewardRatio, uint256 ORatio) external returns (uint256);

    function unwrap(address to, uint256 tokenId, uint8 sigV, bytes32 sigR, bytes32 sigS) external;

    function transferOTokens(address to, uint256 tokenId, uint256 amount) external;

    function releaseOR(address payable account) external;

    function releaseAllottedTokens(address account, address token) external;

    function getORInfo(uint256 tokenId) external view returns(uint256, uint256, address, address[] memory);

    function getAllottedOR(address account) external view returns(uint256);

    function getAllottedTokens(address account, address token) external view returns (uint256);

    function balanceOfOTokens(uint256 tokenId, address account) external view returns(uint256);

    function getUnderlyingTokenAddress() external view returns (address);
}