// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.8;

import "@solidstate/contracts/proxy/diamond/SolidStateDiamond.sol";

contract unCryptoDiamond is SolidStateDiamond { // This contract has one sole purpose, and that is to be a "beacon" or unified shared implementation that the unCrypto Proxies can derive from. Anything we cut to this contract will be reflected amongst all of our proxies. This is not like the "core" contract, because it is not the core of our operations, but rather it is the core implementation. It's the code beacon for our proxies. Could be renamed unCryptoBeaconDiamond

}
