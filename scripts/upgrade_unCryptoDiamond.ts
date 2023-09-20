import { ethers, deployments, getNamedAccounts } from "hardhat";

import { Selectors, FacetCutAction } from '../test/libraries/diamond';

/**
 * Upgrades unCryptoDiamond with a new unFacet
 */
const main = async () => {  
    const { execute, get } = deployments;

    const { deployer } = await getNamedAccounts();

    const unFacet = await ethers.getContractAt("unFacet", (await get('unFacet')).address);

    const cut = [{ target: unFacet.address, action: FacetCutAction.Replace, selectors: new Selectors(unFacet).remove(['supportsInterface(bytes4)']) }]; // When removing, be sure to set target to AddressZero

    await execute('unCryptoDiamond', {from: deployer}, 'diamondCut', cut, ethers.constants.AddressZero, "0x");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});