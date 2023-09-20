import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
	const { deployments, getNamedAccounts } = hre;
	const { deploy, get } = deployments;

	const { deployer } = await getNamedAccounts();

	await deploy('unFacet', {
		from: deployer,
	});
};

export default func;
func.tags = ["unFacet"];