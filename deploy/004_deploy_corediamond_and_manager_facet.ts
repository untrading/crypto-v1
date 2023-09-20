import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
	const { deployments, getNamedAccounts } = hre;
	const { deploy, get } = deployments;

	const { deployer } = await getNamedAccounts();

	await deploy('Core', {
		from: deployer,
	});

    await deploy('unCryptoManager', {
		from: deployer,
        args: [(await get("unCryptoDiamond")).address]
	});
};

export default func;
func.tags = ["Core"]