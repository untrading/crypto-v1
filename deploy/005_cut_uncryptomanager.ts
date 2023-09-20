import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { Selectors, FacetCutAction } from '../test/libraries/diamond';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
	const { deployments, getNamedAccounts, ethers } = hre;
	const { get, execute } = deployments;

	const { deployer } = await getNamedAccounts();

    const unCryptoManagerFacet = await ethers.getContractAt("unCryptoManager", (await get('unCryptoManager')).address);

	const cut = [{ target: unCryptoManagerFacet.address, action: FacetCutAction.Add, selectors: new Selectors(unCryptoManagerFacet).getSelectors() }];

	await execute('Core', {from: deployer}, 'diamondCut', cut, ethers.constants.AddressZero, "0x");
};

export default func;
func.tags = ["unCryptoManager"]