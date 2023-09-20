# untrading Crypto v1

https://untrading.org

The core contracts that power the Crypto aspect of untrading.org. Utilizes EIP-5173 Divisible (nFR), EIP-2535 (Diamonds), and SolidState solidity libraries.

## Development

Install dependencies with Yarn:

```bash
yarn install
```

Create a .env file and define the following:

| Key                         | Description                                                              |
| --------------------------- | ------------------------------------------------------------------------ |
| `INFURA_TOKEN`              | [Infura](https://www.infura.io/) API key for node connectivity           |
| `ETHERSCAN_API_KEY`         | [Etherscan](https://etherscan.io//) API key for source code verification |
| `DEPLOYER_PRIVATE_KEY`      | Private key used for deploying the contracts                             |
| `UNTRADING_MANAGER_ADDRESS` | The address which will act as the untrading manager                      |

## Submodules

### Clone

```bash
git clone --recurse-submodules
```

### Update

```bash
git submodule update --remote
```

## Testing

Test contracts with Hardhat:

```bash
yarn hardhat test
```

## Licensing

The primary license for the untrading crypto contracts is the Business Source License 1.1 (`BUSL-1.1`), see 
[`LICENSE`](./LICENSE).

### Exceptions

- Interfaces are licensed under `GPL-2.0-or-later` (as indicated in their SPDX headers), see [`LICENSE_GPL`](./LICENSE_GPL)
- All files in `contracts/test` remain unlicensed.
