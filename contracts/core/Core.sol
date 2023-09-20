// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.8;

import "@solidstate/contracts/proxy/diamond/SolidStateDiamond.sol";

contract Core is SolidStateDiamond { //? This Diamond could be renamed to something akin to a "Core" contract, as it is essentially that. Some possibilites are "Core", "CoreDiamond", "unCryptoDiamond", "unCryptoCoreDiamond". It can have the unCryptoManager Facet along with other core facets cut into it like -> A facet which is responsible for having a central list of supported tokens to be used across all proxies.
    
}
