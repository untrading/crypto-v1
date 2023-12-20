import { HardhatUserConfig } from "hardhat/config";
import "dotenv/config";
import "@nomiclabs/hardhat-ethers"
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.8",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },

  namedAccounts: {
    deployer: 0, // Deployer
    untradingManager: process.env.UNTRADING_MANAGER_ADDRESS ?? 0 // Contract/untrading Manager address
  },

  networks: {
    goerli: {
      url: `https://goerli.infura.io/v3/${process.env.INFURA_TOKEN}`, // RPC URL
      accounts: process.env.DEPLOYER_PRIVATE_KEY == undefined ? [] : [`0x${process.env.DEPLOYER_PRIVATE_KEY}`],
      saveDeployments: true,
    },
    mumbai: {
      url: `https://polygon-mumbai.infura.io/v3/${process.env.INFURA_TOKEN}`, // RPC URL
      accounts: process.env.DEPLOYER_PRIVATE_KEY == undefined ? [] : [`0x${process.env.DEPLOYER_PRIVATE_KEY}`],
      saveDeployments: true,
    },
    sepolia: {
      url: `https://sepolia.infura.io/v3/${process.env.INFURA_TOKEN}`, // RPC URL
      accounts: process.env.DEPLOYER_PRIVATE_KEY == undefined ? [] : [`0x${process.env.DEPLOYER_PRIVATE_KEY}`],
      saveDeployments: true,
    },
    polygon: {
      url: `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_TOKEN}`, // RPC URL
      accounts: process.env.DEPLOYER_PRIVATE_KEY == undefined ? [] : [`0x${process.env.DEPLOYER_PRIVATE_KEY}`],
      saveDeployments: true,
    },
    ethereum: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_TOKEN}`, // RPC URL
      accounts: process.env.DEPLOYER_PRIVATE_KEY == undefined ? [] : [`0x${process.env.DEPLOYER_PRIVATE_KEY}`],
      saveDeployments: true,
    },
  },
  
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY
    }
  },

  etherscan: {
    apiKey: {
      goerli: process.env.ETHERSCAN_API_KEY
    }
  }
};

export default config;
