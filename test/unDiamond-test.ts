import { UnFacet, UnCryptoManager } from '../typechain-types/contracts';
import { MockERC20 } from '../typechain-types/contracts/test';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, Signature } from "ethers";

import { expect } from "chai";
import { ethers } from "hardhat";

import { Selectors, FacetCutAction } from './libraries/diamond';

import { div, mul } from "@prb/math";

describe("untrading Crypto Contracts", () => {
	const tokenAmount = ethers.utils.parseUnits("1");

	const numGenerations = 10;

	const rewardRatio = ethers.utils.parseUnits("0.35");

	const ORatio = ethers.utils.parseUnits("0.4");

	const proportionalORatio = mul(rewardRatio, ORatio);

	const percentOfProfit = mul(rewardRatio, ethers.utils.parseUnits("0.6"));

	const successiveRatio = (div(ethers.utils.parseUnits("10"), (ethers.utils.parseUnits("10").sub(ethers.utils.parseUnits("1.618"))))).div(100).mul(100); // Uses @prb/math mulDiv to get NumGen/(NumGen-1.618), then does ( / 100 * 100 ) using BN functions instead

	const baseSale = ethers.utils.parseUnits("1");

	const saleIncrementor = "0.5";

	const tokenId = 1;

	const expectedFR = "159999999999999998"; // (percentOfProfit at 0.16) 16% of the profit on the first sale (1 ETH profit) should be 0.16 ETH aka 0.16e18, however, due to the precision of the successive ratio it is 2 units off

	const managerCut = ethers.utils.parseUnits("0.30");

	const paymentToken = ethers.constants.AddressZero;

	const transferAmount = ethers.utils.parseUnits("0.5");

	let unFactory;
	let unFacetAddress: string;

	let unDiamond: UnFacet; // Uses unFacet ABI - unFacet at unDiamond
	let unManager: UnCryptoManager;
	let unProxy: UnFacet;
	let owner: SignerWithAddress;
	let untradingManager: SignerWithAddress;
	let addrs: SignerWithAddress[];

	let oTokenHolders;

	let ERC20Token: MockERC20;

	beforeEach(async function() {
		// Deploy unCryptoDiamond and cut unFacet
		unFactory = await ethers.getContractFactory("unCryptoDiamond");
		[owner, untradingManager, ...addrs] = await ethers.getSigners();

		const undiamond = await unFactory.deploy();
		await undiamond.deployed();

		const unFacetFactory = await ethers.getContractFactory("unFacet");
		const unFacet = await unFacetFactory.deploy();
		await unFacet.deployed();

		unFacetAddress = unFacet.address;

		let cut = [{ target: unFacet.address, action: FacetCutAction.Add, selectors: new Selectors(unFacet).remove(['supportsInterface(bytes4)']) }];
		await undiamond.diamondCut(cut, ethers.constants.AddressZero, "0x"); // Just a reminder the second 2 args after cut are for initializers, an initializer address and calldata that would be delegatecalled. Not needed, at least for now. Another reminder, you can have multiple actions (removals, additions, replacements) in 1 tx, because it is an array of FacetActions.

		unDiamond = await ethers.getContractAt('unFacet', undiamond.address);

		// Deploy Core Diamond and cut Manager facet

		let coreDiamond = await (await ethers.getContractFactory("Core")).deploy();

		let unCryptoManagerFacet = await (await ethers.getContractFactory("unCryptoManager")).deploy(unDiamond.address);

		cut = [{ target: unCryptoManagerFacet.address, action: FacetCutAction.Add, selectors: new Selectors(unCryptoManagerFacet).getSelectors() }];

		await coreDiamond.diamondCut(cut, ethers.constants.AddressZero, "0x");

		unManager = await ethers.getContractAt('unCryptoManager', coreDiamond.address);

		/* Create a proxy from unCryptoManager */

		// Deploy the underlying ERC20 token
		let ERC20TokenContract = await (await ethers.getContractFactory("MockERC20")).deploy();
	
		ERC20Token = await ethers.getContractAt("MockERC20", ERC20TokenContract.address);

		await ERC20Token.mint(owner.address, tokenAmount.mul(2));

		// Create the proxy
		let unProxyAddress = await unManager.callStatic.deployCryptoProxy(ERC20Token.address, untradingManager.address, managerCut, "untrading Crypto Wrapping Contract", "unCrypto", ""); // Grab return value from staticCall
		let unproxy = await unManager.deployCryptoProxy(ERC20Token.address, untradingManager.address, managerCut, "untrading Crypto Wrapping Contract", "unCrypto", "");

		unProxy = await ethers.getContractAt('unFacet', unProxyAddress);

		// Wrap a token

		await ERC20Token.approve(unProxy.address, tokenAmount);

		await unProxy.wrap(owner.address, tokenAmount, ethers.constants.AddressZero, numGenerations, rewardRatio, ORatio);

	});

	describe("Manager", () => {
		describe("Core Diamond", () => {
			describe("Upgradeability", () => {
				it("Should be able to replace functions with a new Facet", async () => {
					let coreDiamond = await ethers.getContractAt('Core', unManager.address);

					let unCryptoManagerFacet = await (await ethers.getContractFactory("unCryptoManager")).deploy(unDiamond.address);

					let cut = [{ target: unCryptoManagerFacet.address, action: FacetCutAction.Replace, selectors: new Selectors(unCryptoManagerFacet).getSelectors() }];					

					await coreDiamond.diamondCut(cut, ethers.constants.AddressZero, "0x");

					expect(await coreDiamond.facetAddresses()).to.deep.equal([ coreDiamond.address, unCryptoManagerFacet.address ]);
				});
			});
		});
	
		describe("unCryptoManager", () => {
			it("Should return unCryptoDiamond address", async () => {
				expect(await unManager.UNCRYPTO_DIAMOND()).to.equal(unDiamond.address);
			});

			describe("Get Proxy", () => {
				it("Should get proxy address", async () => {
					expect(await unManager.getProxy(ERC20Token.address)).to.equal(unProxy.address);
				});

				it("Should return proxy list", async () => {
					expect(await unManager.getProxyList()).to.deep.equal([ unProxy.address ]);
				});
			});

			describe("Deploy Proxy", () => {
				describe("Reverts", () => {
					it("Should revert if not permitted", async () => {
						let unauthorizedCaller = unManager.connect(addrs[0]);

						await expect(unauthorizedCaller.deployCryptoProxy(ERC20Token.address, untradingManager.address, managerCut, "untrading Crypto Wrapping Contract", "unCrypto", "")).to.be.revertedWithCustomError(unManager, "Ownable__NotOwner");
					});
				});

				it("Should successfully create a new proxy", async () => {
					let unProxyAddress = await unManager.callStatic.deployCryptoProxy(ERC20Token.address, untradingManager.address, managerCut, "untrading Crypto Wrapping Contract", "unCrypto", ""); // Grab return value from staticCall
					let unproxy = await unManager.deployCryptoProxy(ERC20Token.address, untradingManager.address, managerCut, "untrading Crypto Wrapping Contract", "unCrypto", "");

					expect(unProxyAddress).to.not.equal(unProxy.address);

					let newProxy = await ethers.getContractAt('unFacet', unProxyAddress);

					expect(await newProxy.getFRInfo(tokenId)).to.deep.equal([ 0, 0, 0, 0, 0, [] ]);
				});
			});
		});
	});
	
	describe("unCryptoDiamond", () => {
		describe("Upgradability", () => {
			describe("Reverts", () => {
				it("Should revert if caller is not permitted", async () => {
					let diamond = await ethers.getContractAt("unCryptoDiamond", unDiamond.address);
	
					let unauthorizedUser = diamond.connect(addrs[0]);
	
					let MockFacetFactory = await ethers.getContractFactory("MockFacet");
	
					let MockFacet = await MockFacetFactory.deploy()
	
					await MockFacet.deployed();
	
					const cut = [{ target: MockFacet.address, action: FacetCutAction.Add, selectors: new Selectors(MockFacet).getSelectors() }];
					
					await expect(unauthorizedUser.diamondCut(cut, ethers.constants.AddressZero, "0x")).to.be.revertedWithCustomError(diamond, "Ownable__NotOwner");
				});
			});
	
			it("Should add new function properly", async () => {
				let diamond = await ethers.getContractAt("unCryptoDiamond", unDiamond.address);
	
				let MockFacetFactory = await ethers.getContractFactory("MockFacet");
	
				let MockFacet = await MockFacetFactory.deploy();
	
				await MockFacet.deployed();
	
				const cut = [{ target: MockFacet.address, action: FacetCutAction.Add, selectors: new Selectors(MockFacet).remove(["setManagerCut(uint256)"]) }];
	
				await diamond.diamondCut(cut, ethers.constants.AddressZero, "0x");
	
				let newDiamond = await ethers.getContractAt("MockFacet", unDiamond.address);
				let newProxy = await ethers.getContractAt("MockFacet", unProxy.address);
	
				expect(await newDiamond.MockFunc()).to.equal("Hello unDiamond");
				expect(await newProxy.MockFunc()).to.equal("Hello unDiamond");
			});
	
			it("Should remove a function properly", async () => {
				let diamond = await ethers.getContractAt("unCryptoDiamond", unDiamond.address);
	
				let MockFacetFactory = await ethers.getContractFactory("MockFacet");
	
				let MockFacet = await MockFacetFactory.deploy();
	
				await MockFacet.deployed();
	
				let cut = [{ target: MockFacet.address, action: FacetCutAction.Add, selectors: new Selectors(MockFacet).remove(["setManagerCut(uint256)"]) }];
	
				await diamond.diamondCut(cut, ethers.constants.AddressZero, "0x");
	
				let newDiamond = await ethers.getContractAt("MockFacet", unDiamond.address);
				let newProxy = await ethers.getContractAt("MockFacet", unProxy.address);
	
				expect(await newDiamond.MockFunc()).to.equal("Hello unDiamond");
				expect(await newProxy.MockFunc()).to.equal("Hello unDiamond");
	
				cut = [{ target: ethers.constants.AddressZero, action: FacetCutAction.Remove, selectors: new Selectors(MockFacet).remove(["setManagerCut(uint256)"]) }];
	
				await diamond.diamondCut(cut, ethers.constants.AddressZero, "0x");
	
				await expect(newDiamond.MockFunc()).to.be.revertedWithCustomError(diamond, "Proxy__ImplementationIsNotContract");
				await expect(newProxy.MockFunc()).to.be.revertedWithCustomError(diamond, "Proxy__ImplementationIsNotContract");
			});
	
			it("Should update a function properly", async () => {
				let diamond = await ethers.getContractAt("unCryptoDiamond", unDiamond.address);
	
				let MockFacetFactory = await ethers.getContractFactory("MockFacet");
	
				let MockFacet = await MockFacetFactory.deploy();
	
				await MockFacet.deployed();
	
				const cut = [{ target: MockFacet.address, action: FacetCutAction.Replace, selectors: new Selectors(MockFacet).remove(["MockFunc()"]) }];
	
				await diamond.diamondCut(cut, ethers.constants.AddressZero, "0x");
	
				let newDiamond = await ethers.getContractAt("MockFacet", unDiamond.address);
				let newProxy = await ethers.getContractAt("MockFacet", unProxy.address);
	
				newDiamond = await newDiamond.connect(untradingManager);
				newProxy = await newProxy.connect(untradingManager);
	
				await newDiamond.setManagerCut(ethers.utils.parseUnits("1"));
				await newProxy.setManagerCut(ethers.utils.parseUnits("1"));
	
				expect(await unDiamond.getManagerInfo()).to.deep.equal([ ethers.constants.AddressZero, ethers.utils.parseUnits("0.4") ]);
				expect(await unProxy.getManagerInfo()).to.deep.equal([ untradingManager.address, ethers.utils.parseUnits("0.4") ]);
			});
	
			it("Should retain data after removing all functions and adding them back", async () => {
				let diamond = await ethers.getContractAt("unCryptoDiamond", unDiamond.address);
	
				const unFacetFactory = await ethers.getContractFactory("unFacet");
				const unFacet = await unFacetFactory.deploy();
				await unFacet.deployed();
	
				let cut = [{ target: ethers.constants.AddressZero, action: FacetCutAction.Remove, selectors: new Selectors(unFacet).remove(["supportsInterface(bytes4)"]) }];
				
				await diamond.diamondCut(cut, ethers.constants.AddressZero, "0x");
	
				await expect(unProxy.getManagerInfo()).to.be.revertedWithCustomError(diamond, "Proxy__ImplementationIsNotContract");
	
				cut = [{ target: unFacet.address, action: FacetCutAction.Add, selectors: new Selectors(unFacet).remove(["supportsInterface(bytes4)"]) }];
	
				await diamond.diamondCut(cut, ethers.constants.AddressZero, "0x");
	
				expect(await unProxy.getManagerInfo()).to.deep.equal([ untradingManager.address, managerCut ]);
	
				let expectedArray = [numGenerations, percentOfProfit, successiveRatio, ethers.BigNumber.from("0"), ethers.BigNumber.from("1"), [owner.address]]; // ..., lastSoldPrice, ownerAmount, addressesIunDiamond
				expect(await unProxy.getFRInfo(tokenId)).to.deep.equal(expectedArray);
			});
		});
	});

	describe("unCryptoProxy", () => {
		describe("Deployment and Retrieval", function() {
			it("Should mint to the proper owner", async function() {
				expect(await unProxy.ownerOf(tokenId)).to.equal(owner.address);
			});
	
			it("Should set and get the correct FR info", async function() {
				let expectedArray = [numGenerations, percentOfProfit, successiveRatio, ethers.BigNumber.from("0"), ethers.BigNumber.from("1"), [owner.address]]; // ..., lastSoldPrice, ownerAmount, addressesIunDiamond
				expect(await unProxy.getFRInfo(tokenId)).to.deep.equal(expectedArray);
			});
	
			it("Should set and get the correct Asset info", async function() {
				let expectedArray = [tokenAmount, tokenAmount];
				expect(await unProxy.getAssetInfo(tokenId)).to.deep.equal(expectedArray);
			});
	
			it("Should return the proper allotted FR", async function() {
				expect(await unProxy.getAllottedFR(owner.address)).to.equal(ethers.BigNumber.from("0"));
			});
	
			it("Should return the proper list info", async function() {
				expect(await unProxy.getListInfo(tokenId)).to.deep.equal([ ethers.BigNumber.from("0"), ethers.BigNumber.from("0"), ethers.constants.AddressZero, false ]);
			});
	
			it("Should return the proper manager info", async () => {
				expect(await unProxy.getManagerInfo()).to.deep.equal([ untradingManager.address, managerCut ]);
			});

			it("Should have proper underlying token address", async () => {
				expect(await unProxy.getUnderlyingTokenAddress()).to.equal(ERC20Token.address);
			});
		});
	
		describe("untrading Transactions", () => {	
			describe("Minting", () => {
				describe("Reverts", () => {
					it("Should revert if numGenerations out of range", async () => {
						await ERC20Token.approve(unProxy.address, tokenAmount);

						await expect(unProxy.wrap(owner.address, tokenAmount, ethers.constants.AddressZero, 25, rewardRatio, ORatio)).to.be.revertedWith("numGenerations must be between 5 and 20");
						await expect(unProxy.wrap(owner.address, tokenAmount, ethers.constants.AddressZero, 4, rewardRatio, ORatio)).to.be.revertedWith("numGenerations must be between 5 and 20");
					});
	
					it("Should revert if rewardRatio out of range", async () => {
						await expect(unProxy.wrap(owner.address, tokenAmount, ethers.constants.AddressZero, numGenerations, ethers.utils.parseUnits("0.04"), ORatio)).to.be.revertedWith("rewardRatio must be between 5% and 50%");
						await expect(unProxy.wrap(owner.address, tokenAmount, ethers.constants.AddressZero, numGenerations, ethers.utils.parseUnits("0.51"), ORatio)).to.be.revertedWith("rewardRatio must be between 5% and 50%");
					});
	
					it("Should revert if ORatio out of range", async () => {
						await expect(unProxy.wrap(owner.address, tokenAmount, ethers.constants.AddressZero, numGenerations, rewardRatio, ethers.utils.parseUnits("0.04"))).to.be.revertedWith("ORatio must be between 5% and 50%");
						await expect(unProxy.wrap(owner.address, tokenAmount, ethers.constants.AddressZero, numGenerations, rewardRatio, ethers.utils.parseUnits("0.51"))).to.be.revertedWith("ORatio must be between 5% and 50%");
					});
				});
			});
	
			describe("oTokens", () => {
				describe("Should have proper oTokens after Mint", () => {
					it("Should have proper OR Info", async () => {
						expect(await unProxy.getORInfo(tokenId)).to.deep.equal([ proportionalORatio, rewardRatio, paymentToken, [untradingManager.address, owner.address] ]);
					});
	
					it("Should have proper oToken Balances", async () => {
						expect(await unProxy.balanceOfOTokens(tokenId, owner.address)).to.equal(ethers.utils.parseUnits("0.7"));
						expect(await unProxy.balanceOfOTokens(tokenId, untradingManager.address)).to.equal(ethers.utils.parseUnits("0.3"));
					});
	
					it("Should have proper allotted OR", async () => {
						expect(await unProxy.getAllottedOR(owner.address)).to.equal("0");
					});
				});
	
				describe("Transfer", () => {
					describe("Reverts", () => {
						it("Should revert if transferring to self", async () => {
							await expect(unProxy.transferOTokens(owner.address, tokenId, ethers.utils.parseUnits("0.1"))).to.be.revertedWith("transfer to self");
						});
	
						it("Should revert if transferring to zero address", async () => {
							await expect(unProxy.transferOTokens(ethers.constants.AddressZero, tokenId, ethers.utils.parseUnits("0.1"))).to.be.revertedWith("transfer to the zero address");
						});
	
						it("Should revert if transferring with insufficient balance", async () => {
							await expect(unProxy.transferOTokens(untradingManager.address, tokenId, ethers.utils.parseUnits("0.8"))).to.be.revertedWith("transfer amount exceeds balance");
						});
	
						it("Should revert if transferring 0 tokens", async () => {
							await expect(unProxy.transferOTokens(untradingManager.address, tokenId, 0)).to.be.revertedWith("transfer amount is 0");
						});
					});
	
					describe("State Changes", () => {
						it("Should properly transfer oTokens", async () => {
							await unProxy.transferOTokens(addrs[0].address, tokenId, ethers.utils.parseUnits("0.1"));
	
							expect(await unProxy.balanceOfOTokens(tokenId, owner.address)).to.equal(ethers.utils.parseUnits("0.6"));
							expect(await unProxy.balanceOfOTokens(tokenId, addrs[0].address)).to.equal(ethers.utils.parseUnits("0.1"));
						});
	
						it("Should properly adjust oToken holders", async () => {
							await unProxy.transferOTokens(addrs[0].address, tokenId, ethers.utils.parseUnits("0.7"));
	
							expect((await unProxy.getORInfo(tokenId))[3]).to.deep.equal([ untradingManager.address, addrs[0].address ]);
	
							let c = await unProxy.connect(addrs[0]);
	
							await c.transferOTokens(addrs[1].address, tokenId, ethers.utils.parseUnits("0.6"));
	
							expect((await unProxy.getORInfo(tokenId))[3]).to.deep.equal([ untradingManager.address, addrs[0].address, addrs[1].address ]);
						});
					});
				});
	
				describe("OR", () => {
					describe("OR Distribution", () => {
						it("Should cycle through 10 FR cycles properly with OR", async () => {
							// Setup for 10 cycles
							await unProxy.list(tokenId, tokenAmount, ethers.utils.parseUnits("1"));
		
							let s = unProxy.connect(addrs[0]);
		
							await s.buy(tokenId, tokenAmount, { value: ethers.utils.parseUnits("1") });
		
							for (let transfers = 0; transfers < 9; transfers++) { // This results in 11 total owners, minter, transfer, 9 more transfers.
								let signer = unProxy.connect(addrs[transfers]);
								let secondSigner = unProxy.connect(addrs[transfers + 1]);
		
								let salePrice = (await unProxy.getFRInfo(tokenId))[3].add(ethers.utils.parseUnits(saleIncrementor)); // Get lastSoldPrice and add incrementor
		
								await signer.list(tokenId, tokenAmount, salePrice);
		
								await secondSigner.buy(tokenId, tokenAmount, { value: salePrice });
							}
	
							// FR Validation
	
							let expectedArray: any = [numGenerations, percentOfProfit, successiveRatio, ethers.utils.parseUnits("5.5"), ethers.BigNumber.from("11"), []];
		
							for (let a = 0; a < 10; a++) {
								expectedArray[5].push(addrs[a].address);
							}
		
							expect(await unProxy.getFRInfo(tokenId)).to.deep.equal(expectedArray);
		
							let totalOwners = [owner.address, ...expectedArray[5]];
		
							let allottedFRs = [];
		
							for (let o of totalOwners) allottedFRs.push(await unProxy.getAllottedFR(o));
		
							let greatestFR = allottedFRs.reduce((m, e) => e.gt(m) ? e : m);
		
							expect(greatestFR).to.equal(allottedFRs[0]);
	
							expect(await ethers.provider.getBalance(unProxy.address)).to.equal(ethers.utils.parseUnits("1.715")); // (0.14) + (9 * 0.5 * 0.35) = 1.715 - Taking fixed-point dust into account - (rewardRatio) + ((totalProfitablePurchases - 1) * (ProfitIncrementor) * (rewardRatio))
	
							// OR Validation
	
							expect(await unProxy.getAllottedOR(owner.address)).to.equal(ethers.utils.parseUnits("0.539")); // ((0.14) + (9*0.5*0.14)) * 0.7
							expect(await unProxy.getAllottedOR(untradingManager.address)).to.equal(ethers.utils.parseUnits("0.231")); // ((0.14) + (9*0.5*0.14)) * 0.3
	
							expect(
									(allottedFRs.reduce((partialSum, a) => partialSum.add(a), ethers.BigNumber.from("0")))
									.add(await unProxy.getAllottedOR(owner.address))
									.add(await unProxy.getAllottedOR(untradingManager.address)))
									.to.be.above(ethers.utils.parseUnits("1.714")
							); // This is to ensure that all the FRs + ORs match the rewardRatio in terms of allocation to the respective addresses. To account for fixed-point dust, 1.714 is checked instead of 1.715, in fact the contract is actually only short 40 wei w/o rounding, 30 wei w/ rounding.
	
							expect((await unProxy.getORInfo(tokenId))[3]).to.deep.equal([ untradingManager.address, owner.address ]); // Ensure holder array is unaltered
						});

						it("Should update OR info if there was a fractional transfer", async () => {
							await unProxy.list(tokenId, tokenAmount, ethers.utils.parseUnits("1"));

							let s = unProxy.connect(addrs[0]);

							await s.buy(tokenId, tokenAmount.div(2), { value: ethers.utils.parseUnits("1").div(2) });

							expect(await unProxy.getORInfo(tokenId + 1)).to.deep.equal(await unProxy.getORInfo(tokenId));
						});

						it("Should cycle through 10 Fractional FR cycles properly with OR", async () => {
							// Setup for 10 cycles
							let buyAmount = tokenAmount.div(2);
							let currentTokenId = tokenId;

							await unProxy.list(currentTokenId, buyAmount, baseSale);
		
							let s = unProxy.connect(addrs[0]);
		
							await s.buy(currentTokenId, buyAmount, { value: baseSale });

							currentTokenId++;

							let expectedContractBalance = ethers.utils.parseUnits("0");

							let firstORPayment = expectedContractBalance.add(mul(baseSale, mul(rewardRatio, ORatio))); // Only OR was paid
		
							for (let transfers = 0; transfers < 9; transfers++) { // This results in 11 total owners, minter, transfer, 9 more transfers.
								let signer = unProxy.connect(addrs[transfers]);
								let secondSigner = unProxy.connect(addrs[transfers + 1]);
								buyAmount = buyAmount.div(2);
		
								let salePrice: BigNumber = (await unProxy.getFRInfo(currentTokenId))[3].add(ethers.utils.parseUnits(saleIncrementor)); // Get lastSoldPrice and add incrementor
								
								let profit = mul(buyAmount, (div(salePrice, buyAmount).sub((div((await unProxy.getFRInfo(currentTokenId))[3], (await unProxy.getAssetInfo(currentTokenId))[1]))))); // Increases by 0.25 each iter, because you are halving the amount you are buying while adding 0.5 -> 0.5/2
		
								await signer.list(currentTokenId, buyAmount, salePrice);
		
								await secondSigner.buy(currentTokenId, buyAmount, { value: salePrice });

								currentTokenId++;

								expectedContractBalance = expectedContractBalance.add(mul(rewardRatio, profit));
							}
	
							// FR Validation
	
							let expectedArray: any = [numGenerations, percentOfProfit, successiveRatio, ethers.utils.parseUnits("5.5"), ethers.BigNumber.from("11"), []];
		
							for (let a = 0; a < 10; a++) {
								expectedArray[5].push(addrs[a].address);
							}
		
							expect(await unProxy.getFRInfo(currentTokenId)).to.deep.equal(expectedArray);

							let expectedAssetInfo = [ethers.utils.parseUnits("0.0009765625"), ethers.utils.parseUnits("0.0009765625")]; // 1 * (1/2**10)

							expect(await unProxy.getAssetInfo(currentTokenId)).to.deep.equal(expectedAssetInfo);

							expect(await unProxy.getAssetInfo(tokenId)).to.deep.equal([ ethers.utils.parseUnits("0.5"), ethers.utils.parseUnits("1") ]);
		
							let totalOwners = [owner.address, ...expectedArray[5]];
		
							let allottedFRs = [];
		
							for (let o of totalOwners) allottedFRs.push(await unProxy.getAllottedFR(o));
		
							let greatestFR = allottedFRs.reduce((m, e) => e.gt(m) ? e : m);
		
							expect(greatestFR).to.equal(allottedFRs[0]);
	
							expect(await ethers.provider.getBalance(unProxy.address)).to.equal(expectedContractBalance.add(firstORPayment));
	
							// OR Validation
	
							expect(await unProxy.getAllottedOR(owner.address)).to.equal(mul(mul(expectedContractBalance, ORatio).add(firstORPayment), ethers.utils.parseUnits("0.7"))); // (Contract Balance) * (ORatio) * (Percent of OR)
							expect(await unProxy.getAllottedOR(untradingManager.address)).to.equal(mul(mul(expectedContractBalance, ORatio).add(firstORPayment), ethers.utils.parseUnits("0.3"))); // (Contract Balance) * (ORatio) * (Percent of OR)
	
							expect(
									(allottedFRs.reduce((partialSum, a) => partialSum.add(a), ethers.BigNumber.from("0")))
									.add(await unProxy.getAllottedOR(owner.address))
									.add(await unProxy.getAllottedOR(untradingManager.address)))
									.to.be.above(expectedContractBalance.add(firstORPayment).sub(30)); // Fixed point dust
							; // This is to ensure that all the FRs + ORs match the rewardRatio in terms of allocation to the respective addresses.
	
							expect((await unProxy.getORInfo(tokenId))[3]).to.deep.equal([ untradingManager.address, owner.address ]); // Ensure holder array is unaltered
						});
					});
					
					describe("Claiming", () => {
						describe("Reverts", () => {
							it("Should revert if no OR allotted", async () => {
								await expect(unProxy["releaseOR(address)"](owner.address)).to.be.revertedWith("No OR Payment due");
							});
						});
						
						describe("State Changes", () => {
							it("Should release FR and OR after successful sale", async () => {
								await unProxy.list(tokenId, tokenAmount, baseSale);
	
								const buyer = unProxy.connect(addrs[0]);
	
								await buyer.buy(tokenId, tokenAmount, { value: baseSale });
	
								expect(await ethers.provider.getBalance(unProxy.address)).to.equal(ethers.utils.parseUnits("0.14")); // Only OR was paid
								expect(await unProxy.getAllottedFR(owner.address)).to.equal(ethers.utils.parseUnits("0")); // 0.35 * 0.6 --- Note --- It seems that the added precision in calculating the Successive Ratio inside the contract with prb-math results in a few wei of dust, maybe we should round it?
								expect(await unProxy.getAllottedOR(owner.address)).to.equal(ethers.utils.parseUnits("0.098")); // 0.35 * 0.4 * 0.7
	
								let ETHBefore = await ethers.provider.getBalance(owner.address);
	
								let releaseTx = await (await unProxy["releaseOR(address)"](owner.address)).wait();
	
								expect(await ethers.provider.getBalance(unProxy.address)).to.equal(ethers.utils.parseUnits("0.042")); // 0.14 - 0.098
								expect(await ethers.provider.getBalance(owner.address)).to.equal((ETHBefore.add(ethers.utils.parseUnits("0.098"))).sub((releaseTx.cumulativeGasUsed).mul(releaseTx.effectiveGasPrice))); // Add amount released - Tx fee
	
								const secondBuyer = unProxy.connect(addrs[1]);
	
								await buyer.list(tokenId, tokenAmount, baseSale.add(ethers.utils.parseUnits(saleIncrementor)));
	
								await secondBuyer.buy(tokenId, tokenAmount, { value: baseSale.add(ethers.utils.parseUnits(saleIncrementor)) });
								
								releaseTx = await (await unProxy["releaseOR(address)"](owner.address)).wait();
								
								ETHBefore = await ethers.provider.getBalance(owner.address);
	
								releaseTx = await (await unProxy["releaseFR(address)"](owner.address)).wait();
	
								expect(await ethers.provider.getBalance(unProxy.address)).to.equal(ethers.utils.parseUnits("0.063")); // OR remaining for untrading manager as FR and OR has been claimed for owner - (1*0.35*0.4*0.3) + (0.5*0.35*0.4*0.3)
								expect(await ethers.provider.getBalance(owner.address)).to.equal((ETHBefore.add(ethers.utils.parseUnits("0.105"))).sub((releaseTx.cumulativeGasUsed).mul(releaseTx.effectiveGasPrice))); // Amount - (0.5*0.35*0.6) = 0.105
	
								expect(await unProxy.getAllottedOR(untradingManager.address)).to.equal(await ethers.provider.getBalance(unProxy.address));
							});
						});
					});
				});
			});
	
			describe("Wrapping", () => {
				describe("Reverts", () => {
					it("Should fail if contract is not approved to transfer token", async () => {
						await expect(unProxy.wrap(owner.address, transferAmount, ethers.constants.AddressZero, numGenerations, rewardRatio, ORatio)).to.be.revertedWith("ERC20: insufficient allowance");
					});

					it("Should fail if underlying token is not possessed by caller", async () => {
						let proxyCaller = await unProxy.connect(addrs[0]);
						let tokenCaller = await ERC20Token.connect(addrs[0]);

						await tokenCaller.approve(unProxy.address, tokenAmount);

						await expect(proxyCaller.wrap(owner.address, transferAmount, ethers.constants.AddressZero, numGenerations, rewardRatio, ORatio)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
					});
	
					it("Should fail with improper arguments", async () => {
						await ERC20Token.approve(unProxy.address, tokenAmount);
						await expect(unProxy.wrap(owner.address, tokenAmount, ethers.constants.AddressZero, 100, rewardRatio, ORatio)).to.be.revertedWith("numGenerations must be between 5 and 20");
					});
				});
	
				it("Should transfer provided token to contract", async () => {
					await ERC20Token.approve(unProxy.address, tokenAmount);
					await unProxy.wrap(owner.address, tokenAmount, ethers.constants.AddressZero, numGenerations, rewardRatio, ORatio);
					expect(await ERC20Token.balanceOf(unProxy.address)).to.equal(tokenAmount.mul(2));
				});
	
				it("Should mint wrapped NFT and update Asset struct", async () => {
					await ERC20Token.approve(unProxy.address, tokenAmount);
					await unProxy.wrap(owner.address, tokenAmount, ethers.constants.AddressZero, numGenerations, rewardRatio, ORatio);
	
					expect(await unProxy.ownerOf(2)).to.equal(owner.address);
					expect(await unProxy.getAssetInfo(2)).to.deep.equal([ tokenAmount, tokenAmount ]);
				});
			});
	
			describe("Unwrapping", () => {
				const blankSigs = { sigV: "0", sigR: ethers.utils.formatBytes32String(""), sigS: ethers.utils.formatBytes32String("") };
	
				const getSignature = async (signer: SignerWithAddress, to:string, tokenId: number): Promise<Signature> => {
					const domain = {
						name: "untrading Crypto Smart Contract",
						version: "1",
						chainId: (await ethers.provider.getNetwork()).chainId,
						verifyingContract: unProxy.address,
						salt: "0xc25ebea6dd97ec30f15ce845010d7e9fee0398194f29ee544b5062c074544590"
					};
	
					const types = {
						Unwrap: [
							{ name: "to", type: "address" },
							{ name: "tokenId", type: "uint256" }
						]
					}
	
					const value = { to, tokenId };
	
					let signature = await signer._signTypedData(domain, types, value);
	
					return ethers.utils.splitSignature(signature);
				}
	
				describe("General Reverts", () => {
					it("Should revert if caller isn't owner", async () => {
						await ERC20Token.approve(unProxy.address, tokenAmount);
	
						await unProxy.wrap(owner.address, tokenAmount, ethers.constants.AddressZero, numGenerations, rewardRatio, ORatio);
	
						let unauthorizedCaller = unProxy.connect(addrs[0]);
	
						await expect(unauthorizedCaller.unwrap(unauthorizedCaller.address, tokenId + 1, blankSigs.sigV, blankSigs.sigR, blankSigs.sigS)).to.be.revertedWith("Caller is not owner of token");
					});
				});
	
				describe("Minter Unwrap", () => {
					describe("Reverts", () => {
						it("Should revert if owner is not the minter or first holder", async () => {
							await ERC20Token.approve(unProxy.address, tokenAmount);
		
							await unProxy.wrap(owner.address, tokenAmount, ethers.constants.AddressZero, numGenerations, rewardRatio, ORatio);
		
							await unProxy["transferFrom(address,address,uint256)"](owner.address, addrs[0].address, tokenId + 1);
		
							let newOwner = unProxy.connect(addrs[0]);
		
							await expect(newOwner.unwrap(newOwner.address, tokenId + 1, blankSigs.sigV, blankSigs.sigR, blankSigs.sigS)).to.be.revertedWith("Invalid signature provided");
						});
					});
		
					it("Should transfer the underlying asset to the caller", async () => {
						expect(await ERC20Token.balanceOf(owner.address)).to.equal(tokenAmount);
		
						await ERC20Token.approve(unProxy.address, tokenAmount);
		
						await unProxy.wrap(owner.address, tokenAmount, ethers.constants.AddressZero, numGenerations, rewardRatio, ORatio);
		
						expect(await ERC20Token.balanceOf(unProxy.address)).to.equal(tokenAmount.mul(2));
		
						await unProxy.unwrap(owner.address, tokenId + 1, blankSigs.sigV, blankSigs.sigR, blankSigs.sigS);
		
						expect(await ERC20Token.balanceOf(owner.address)).to.equal(tokenAmount);
					});
		
					it("Should burn the NFT and delete all data associated with it", async () => {
						await ERC20Token.approve(unProxy.address, tokenAmount);
		
						await unProxy.wrap(owner.address, tokenAmount, ethers.constants.AddressZero, numGenerations, rewardRatio, ORatio);
		
						await unProxy.unwrap(owner.address, tokenId + 1, blankSigs.sigV, blankSigs.sigR, blankSigs.sigS);
		
						expect(await unProxy.getFRInfo(tokenId + 1)).to.deep.equal([ 0, 0, 0, 0, 0, []]);
						expect(await unProxy.getListInfo(tokenId + 1)).to.deep.equal([ 0, 0, ethers.constants.AddressZero, false ]);
						expect(await unProxy.getAssetInfo(tokenId + 1)).to.deep.equal([ 0, 0 ]);
						expect(await unProxy.getORInfo(tokenId + 1)).to.deep.equal([ 0, 0, ethers.constants.AddressZero, [] ]);
					});
				});
	
				describe("Future Owner Unwrap", () => {
					describe("Reverts", () => {
						it("Should revert if signature is invalid", async () => {
							await ERC20Token.approve(unProxy.address, tokenAmount);
		
							await unProxy.wrap(owner.address, tokenAmount, ethers.constants.AddressZero, numGenerations, rewardRatio, ORatio);
	
							await unProxy["transferFrom(address,address,uint256)"](owner.address, addrs[0].address, tokenId + 1);
	
							let signature = await getSignature(addrs[0], addrs[0].address, tokenId + 1);
	
							let signer = unProxy.connect(addrs[0]);
	
							await expect(signer.unwrap(addrs[0].address, tokenId + 1, blankSigs.sigV, blankSigs.sigR, blankSigs.sigS)).to.be.revertedWith("Invalid signature provided");
							await expect(signer.unwrap(addrs[0].address, tokenId + 1, signature.v, signature.r, signature.s)).to.be.revertedWith("Invalid signature provided");
						});
	
						it("Should revert if signature is from 2nd largest o-token holder", async () => {
							await ERC20Token.approve(unProxy.address, tokenAmount);
		
							await unProxy.wrap(owner.address, tokenAmount, ethers.constants.AddressZero, numGenerations, rewardRatio, ORatio);
	
							await unProxy["transferFrom(address,address,uint256)"](owner.address, addrs[0].address, tokenId + 1);
	
							await unProxy.transferOTokens(addrs[0].address, tokenId + 1, ethers.utils.parseUnits("0.3")); // O-token holdings should look like { untradingManager: 0.3, owner: 0.4, addrs[0]: 0.3 }
	
							let signature = await getSignature(addrs[0], addrs[0].address, tokenId + 1);
	
							let signer = unProxy.connect(addrs[0]);
	
							await expect(signer.unwrap(addrs[0].address, tokenId + 1, signature.v, signature.r, signature.s)).to.be.revertedWith("Invalid signature provided");
						});
					});
	
					it("Should successfully unwrap if untrading manager signature was provided", async () => {
						await ERC20Token.approve(unProxy.address, tokenAmount);
		
						await unProxy.wrap(owner.address, tokenAmount, ethers.constants.AddressZero, numGenerations, rewardRatio, ORatio);
	
						await unProxy["transferFrom(address,address,uint256)"](owner.address, addrs[0].address, tokenId + 1);
	
						let signature = await getSignature(untradingManager, addrs[0].address, tokenId + 1);
	
						let signer = unProxy.connect(addrs[0]);
	
						await signer.unwrap(addrs[0].address, tokenId + 1, signature.v, signature.r, signature.s);
	
						expect(await ERC20Token.balanceOf(addrs[0].address)).to.equal(tokenAmount); // Underlying Asset Transferred
					});
	
					it("Should successfully unwrap if largest o-token holder signature was provided", async () => {
						await ERC20Token.approve(unProxy.address, tokenAmount);
		
						await unProxy.wrap(owner.address, tokenAmount, ethers.constants.AddressZero, numGenerations, rewardRatio, ORatio);
	
						await unProxy["transferFrom(address,address,uint256)"](owner.address, addrs[0].address, tokenId + 1);
	
						let signature = await getSignature(owner, addrs[0].address, tokenId + 1);
	
						let signer = unProxy.connect(addrs[0]);
	
						await signer.unwrap(addrs[0].address, tokenId + 1, signature.v, signature.r, signature.s);
	
						expect(await ERC20Token.balanceOf(addrs[0].address)).to.equal(tokenAmount); // Underlying Asset Transferred
					});
				});
			});

			describe("Non-native Token Transactions", () => { // Need to refactor these tests
				let ERC20PaymentToken: MockERC20;
				let mintAmount = ethers.utils.parseUnits("10000");

				beforeEach(async () => {
					/* Setup ERC20 Payment Token */
					let ERC20PaymentTokenContract = await (await ethers.getContractFactory("MockERC20")).deploy();
	
					ERC20PaymentToken = await ethers.getContractAt("MockERC20", ERC20PaymentTokenContract.address);

					await ERC20PaymentToken.mint(owner.address, mintAmount);

					/* Setup new token */

					await ERC20Token.approve(unProxy.address, tokenAmount);

					await unProxy.wrap(owner.address, tokenAmount, ERC20PaymentToken.address, numGenerations, rewardRatio, ORatio);
				});

				describe("Minting", () => {
					it("Should use supplied payment token when wrapping", async () => {
						expect((await unProxy.getORInfo(tokenId + 1))[2]).to.equal(ERC20PaymentToken.address);
					});
				});

				describe("Buying", () => {
					describe("Reverts", () => {
						it("Should revert if contract is not approved for payment token amount/caller does not have sufficient tokens", async () => {
							await unProxy.list(tokenId + 1, tokenAmount, ethers.utils.parseUnits("1"));

							let signer = unProxy.connect(addrs[0]);

							await expect(signer.buy(tokenId + 1, tokenAmount)).to.be.revertedWith("ERC20: insufficient allowance");
						});
					});

					it("Should transfer ERC20 payment token to contract", async () => {
						await unProxy.list(tokenId + 1, tokenAmount, ethers.utils.parseUnits("1"));

						await ERC20PaymentToken.mint(addrs[0].address, mintAmount);

						let ERC20Signer = ERC20PaymentToken.connect(addrs[0]);

						await ERC20Signer.approve(unProxy.address, ethers.utils.parseUnits("1"));

						let unProxySigner = unProxy.connect(addrs[0]);

						await unProxySigner.buy(tokenId + 1, tokenAmount);

						expect(await ERC20PaymentToken.balanceOf(unProxy.address)).to.equal(ethers.utils.parseUnits("0.14")); // Only OR paid
					});

					it("Should allocate FR in ERC20 to FR cycle members", async () => {
						await unProxy.list(tokenId + 1, tokenAmount, ethers.utils.parseUnits("1"));

						await ERC20PaymentToken.mint(addrs[0].address, mintAmount);

						let ERC20Signer = ERC20PaymentToken.connect(addrs[0]);

						await ERC20Signer.approve(unProxy.address, ethers.utils.parseUnits("1"));

						let unProxySigner = unProxy.connect(addrs[0]);

						await unProxySigner.buy(tokenId + 1, tokenAmount);

						/* 2nd Purchase so FR can be paid */

						await unProxySigner.list(tokenId + 1, tokenAmount, ethers.utils.parseUnits("2"));

						await ERC20PaymentToken.mint(addrs[1].address, mintAmount);

						let ERC20Signer2 = ERC20PaymentToken.connect(addrs[1]);

						await ERC20Signer2.approve(unProxy.address, ethers.utils.parseUnits("2"));

						let unProxySigner2 = unProxy.connect(addrs[1]);

						await unProxySigner2.buy(tokenId + 1, tokenAmount);

						expect(await unProxy.getAllottedTokens(owner.address, ERC20PaymentToken.address)).to.equal(ethers.utils.parseUnits("0.406")); // 0.098 (0.35 * 0.4 * 0.7) + 0.21 (Full FR) + 0.098 (OR - Manager Cut)
						expect(await unProxy.getAllottedTokens(addrs[0].address, ERC20PaymentToken.address)).to.equal(ethers.utils.parseUnits("0"));
					});

					it("Should allocate OR to o-token holders", async () => {
						await unProxy.list(tokenId + 1, tokenAmount, ethers.utils.parseUnits("1"));

						await ERC20PaymentToken.mint(addrs[0].address, mintAmount);

						let ERC20Signer = ERC20PaymentToken.connect(addrs[0]);

						await ERC20Signer.approve(unProxy.address, ethers.utils.parseUnits("1"));

						let unProxySigner = unProxy.connect(addrs[0]);

						await unProxySigner.buy(tokenId + 1, tokenAmount);

						/* 2nd Purchase so FR can be paid */

						await unProxySigner.list(tokenId + 1, tokenAmount, ethers.utils.parseUnits("2"));

						await ERC20PaymentToken.mint(addrs[1].address, mintAmount);

						let ERC20Signer2 = ERC20PaymentToken.connect(addrs[1]);

						await ERC20Signer2.approve(unProxy.address, ethers.utils.parseUnits("2"));

						let unProxySigner2 = unProxy.connect(addrs[1]);

						await unProxySigner2.buy(tokenId + 1, tokenAmount);

						expect(await unProxy.getAllottedTokens(owner.address, ERC20PaymentToken.address)).to.equal(ethers.utils.parseUnits("0.406")); // 0.098 (0.35 * 0.4 * 0.7) + 0.21 (Full FR) + 0.098 (OR - Manager Cut)
						expect(await unProxy.getAllottedTokens(untradingManager.address, ERC20PaymentToken.address)).to.equal(ethers.utils.parseUnits("0.084")); // 0.042 * 2 (0.35 * 0.4 * 0.3)
					});

					it("Should take FR+OR and return rest of the ERC20 token to lister", async () => {
						await unProxy.list(tokenId + 1, tokenAmount, ethers.utils.parseUnits("1"));

						await ERC20PaymentToken.mint(addrs[0].address, mintAmount);

						let ERC20Signer = ERC20PaymentToken.connect(addrs[0]);

						await ERC20Signer.approve(unProxy.address, ethers.utils.parseUnits("1"));

						let unProxySigner = unProxy.connect(addrs[0]);

						await unProxySigner.buy(tokenId + 1, tokenAmount);

						expect(await ERC20PaymentToken.balanceOf(owner.address)).to.equal(mintAmount.add(ethers.utils.parseUnits("0.86")));
						expect(await ERC20PaymentToken.balanceOf(unProxy.address)).to.equal(ethers.utils.parseUnits("0.14")); // Only OR was paid

						/* 2nd Purchase so FR can be paid */

						await unProxySigner.list(tokenId + 1, tokenAmount, ethers.utils.parseUnits("2"));

						await ERC20PaymentToken.mint(addrs[1].address, mintAmount);

						let ERC20Signer2 = ERC20PaymentToken.connect(addrs[1]);

						await ERC20Signer2.approve(unProxy.address, ethers.utils.parseUnits("2"));

						let unProxySigner2 = unProxy.connect(addrs[1]);

						await unProxySigner2.buy(tokenId + 1, tokenAmount);

						expect(await ERC20PaymentToken.balanceOf(addrs[0].address)).to.equal(mintAmount.sub(ethers.utils.parseUnits("1")).add(ethers.utils.parseUnits("1.65"))); // 0.35 taken as rewardRatio and 1.65/2 remains
						expect(await ERC20PaymentToken.balanceOf(unProxy.address)).to.equal(ethers.utils.parseUnits("0.49")); // FR + OR Paid 0.14 + 0.35
					});

					it("Fractional transfers should be treated properly", async () => {
						await unProxy.list(tokenId + 1, tokenAmount, ethers.utils.parseUnits("1"));

						await ERC20PaymentToken.mint(addrs[0].address, mintAmount);

						let ERC20Signer = ERC20PaymentToken.connect(addrs[0]);

						await ERC20Signer.approve(unProxy.address, ethers.utils.parseUnits("1"));

						let unProxySigner = unProxy.connect(addrs[0]);

						await unProxySigner.buy(tokenId + 1, tokenAmount);

						expect(await ERC20PaymentToken.balanceOf(unProxy.address)).to.equal(ethers.utils.parseUnits("0.14")); // Only OR was paid

						/* 2nd Purchase so FR can be paid */

						await unProxySigner.list(tokenId + 1, tokenAmount.div(2), ethers.utils.parseUnits("1")); // Profit 0.5

						await ERC20PaymentToken.mint(addrs[1].address, mintAmount);

						let ERC20Signer2 = ERC20PaymentToken.connect(addrs[1]);

						await ERC20Signer2.approve(unProxy.address, ethers.utils.parseUnits("1"));

						let unProxySigner2 = unProxy.connect(addrs[1]);

						await unProxySigner2.buy(tokenId + 1, tokenAmount.div(2));

						expect(await ERC20PaymentToken.balanceOf(unProxy.address)).to.equal(ethers.utils.parseUnits("0.14").add(ethers.utils.parseUnits("0.175")));
						expect(await unProxy.getAllottedTokens(owner.address, ERC20PaymentToken.address)).to.equal(ethers.utils.parseUnits("0.252")); // 0.098 (0.35 * 0.4 * 0.7) + 0.105 (Full FR) + 0.049 (OR - Manager Cut)
					});

					it("Any descendant tokens should have the same payment token", async () => {
						await unProxy["transferFrom(address,address,uint256,uint256)"](owner.address, addrs[0].address, tokenId + 1, tokenAmount.div(2));

						expect((await unProxy.getORInfo(tokenId + 2))[2]).to.equal(ERC20PaymentToken.address);
					});
				});

				describe("Claiming", () => {
					describe("Reverts", () => {
						it("Should revert if there are no allotted rewards", async () => {
							await expect(unProxy.releaseAllottedTokens(owner.address, ERC20PaymentToken.address)).to.be.revertedWith("No Payment due");
						});
					});

					it("Should claim ERC20 tokens and reset balance", async () => {
						await unProxy.list(tokenId + 1, tokenAmount, ethers.utils.parseUnits("1"));

						await ERC20PaymentToken.mint(addrs[0].address, mintAmount);

						let ERC20Signer = ERC20PaymentToken.connect(addrs[0]);

						await ERC20Signer.approve(unProxy.address, ethers.utils.parseUnits("1"));

						let unProxySigner = unProxy.connect(addrs[0]);

						await unProxySigner.buy(tokenId + 1, tokenAmount);

						expect(await ERC20PaymentToken.balanceOf(unProxy.address)).to.equal(ethers.utils.parseUnits("0.14"));

						let expectedBalance = mintAmount.add(ethers.utils.parseUnits("0.86"));

						expect(await ERC20PaymentToken.balanceOf(owner.address)).to.equal(expectedBalance);
						expect(await unProxy.getAllottedTokens(owner.address, ERC20PaymentToken.address)).to.equal(ethers.utils.parseUnits("0.098"));

						await unProxy.releaseAllottedTokens(owner.address, ERC20PaymentToken.address);

						expect(await ERC20PaymentToken.balanceOf(unProxy.address)).to.equal(ethers.utils.parseUnits("0.042")); // Manager portion left
						expect(await ERC20PaymentToken.balanceOf(owner.address)).to.equal(expectedBalance.add(ethers.utils.parseUnits("0.098")));

						expect(await unProxy.getAllottedTokens(owner.address, ERC20PaymentToken.address)).to.equal(ethers.utils.parseUnits("0"));
					});

					it("Should emit ERC20RewardsClaimed event", async () => {
						await unProxy.list(tokenId + 1, tokenAmount, ethers.utils.parseUnits("1"));

						await ERC20PaymentToken.mint(addrs[0].address, mintAmount);

						let ERC20Signer = ERC20PaymentToken.connect(addrs[0]);

						await ERC20Signer.approve(unProxy.address, ethers.utils.parseUnits("1"));

						let unProxySigner = unProxy.connect(addrs[0]);

						await unProxySigner.buy(tokenId + 1, tokenAmount);

						expect(await unProxy.releaseAllottedTokens(owner.address, ERC20PaymentToken.address)).to.emit(unProxy, "ERC20RewardsClaimed");
					});
				});
			});
	
			describe("Management", () => {
				describe("Manager Cut", () => {
					describe("Reverts", () => {
						it("Should revert if caller is not permitted", async () => {
							await expect(unProxy.setManagerCut(ethers.utils.parseUnits("1"))).to.be.revertedWith("Caller not permitted");
						});
					});
	
					it("Should change manager cut", async () => {
						let manager = unProxy.connect(untradingManager);
						await manager.setManagerCut(ethers.utils.parseUnits("0.4"));
						expect(await unProxy.getManagerInfo()).to.deep.equal([ untradingManager.address, ethers.utils.parseUnits("0.4") ]);
					});
				});
			});
		});
	});
});