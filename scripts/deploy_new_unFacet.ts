import { deployments, getNamedAccounts } from "hardhat";

/**
 * Deploys a new unFacet, supposed to be used before calling upgrade_unDiamond
 */
const main = async () => {  
    const { deploy } = deployments;

    const { deployer } = await getNamedAccounts();
    
    await deploy("unFacet", {
        from: deployer,
    });
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});