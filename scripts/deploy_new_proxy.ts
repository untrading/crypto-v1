import { parseUnits } from 'ethers/lib/utils';

import { ethers, deployments, getNamedAccounts } from "hardhat";

const underlyingTokenAddress = "";
const managerCut = parseUnits("0") // No managerCut
const name = "untrading Wrapped Ether";
const symbol = "unETH";
const baseURI = "";

/**
 * Deploys new proxy of the unCryptoDiamond - Derivative Token
 */
const main = async () => {  
    const { get } = deployments;

    const { deployer, untradingManager } = await getNamedAccounts();

    const unCryptoManager = await ethers.getContractAt("unCryptoManager", (await get('Core')).address, deployer);

    await unCryptoManager.deployCryptoProxy(underlyingTokenAddress, untradingManager, managerCut, name, symbol, baseURI);
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});