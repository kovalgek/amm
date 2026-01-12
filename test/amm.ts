import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { parseEther } from "viem";
const { viem, networkHelpers } = await network.connect();

const initialReserveTokenA = parseEther("10");
const initialReserveTokenB = parseEther("10");

describe("AMM", function () {
  async function deployAmmFixture() {
    const publicClient = await viem.getPublicClient();
    const [deployer, user] = await viem.getWalletClients();
    if (!deployer.account) {
      throw new Error("Wallet client has no account");
    }

    const owner = deployer.account.address;
    const tokenA = await viem.deployContract("MyERC20", [
      "TokenA",
      "TKA",
      owner,
    ]);    

    const tokenB = await viem.deployContract("MyERC20", [
      "TokenB",
      "TKB",
      owner,
    ]);

    const amm = await viem.deployContract("AMM", [
      tokenA.address,
      tokenB.address
    ]);

    await tokenA.write.mint([owner, initialReserveTokenA]);
    await tokenB.write.mint([owner, initialReserveTokenB]);
    await tokenA.write.approve([amm.address, initialReserveTokenA]);
    await tokenB.write.approve([amm.address, initialReserveTokenB]);
    await amm.write.addLiquidity([initialReserveTokenA, initialReserveTokenB]);

    return {
      publicClient,
      deployer,
      owner,
      user,
      amm,
      tokenA,
      tokenB
    }
  }

  it("initial state", async function() {
    const { tokenA, tokenB } = await networkHelpers.loadFixture(deployAmmFixture);

    const tokenATotalSupply = await tokenA.read.totalSupply();
    assert.equal(tokenATotalSupply, parseEther("10"));

    const tokenBTotalSupply = await tokenB.read.totalSupply();
    assert.equal(tokenBTotalSupply, parseEther("10"));
  });

  it("swap", async function() {
 
    const { tokenA, tokenB, user, amm } = await networkHelpers.loadFixture(deployAmmFixture);
    
    const swapAmount = parseEther("2.5");
    await tokenA.write.mint([user.account.address, swapAmount]);

    const userBalanceOfTokenABeforeSwap = await tokenA.read.balanceOf([user.account.address]);
    const userBalanceOfTokenBBeforeSwap = await tokenB.read.balanceOf([user.account.address]);
    const ammBalanceOfTokenABeforeSwap = await tokenA.read.balanceOf([amm.address]);
    const ammBalanceOfTokenBBeforeSwap = await tokenB.read.balanceOf([amm.address]);
    
    await tokenA.write.approve([amm.address, swapAmount], {account: user.account});
 
    await amm.write.swapXForY([swapAmount, user.account.address], {account: user.account});

    const ammBalanceOfTokenAAfterSwap = await tokenA.read.balanceOf([amm.address]);
    assert.equal(ammBalanceOfTokenAAfterSwap - ammBalanceOfTokenABeforeSwap, swapAmount);

    const userBalanceOfTokenAAfterSwap = await tokenA.read.balanceOf([user.account.address]);
    const userBalanceOfTokenBAfterSwap = await tokenB.read.balanceOf([user.account.address]);
    const fee = await amm.read.SWAPPING_FEE();
    const basisScale = await amm.read.BASIS_POINT_SCALE();
    const swapAmountWithFee = swapAmount * (basisScale - fee);
    const receiveAmountOfTokenB = (ammBalanceOfTokenBBeforeSwap * swapAmountWithFee) / (ammBalanceOfTokenABeforeSwap * basisScale + swapAmountWithFee); 
    assert.equal(userBalanceOfTokenABeforeSwap - userBalanceOfTokenAAfterSwap, swapAmount);
    assert.equal(userBalanceOfTokenBAfterSwap - userBalanceOfTokenBBeforeSwap, receiveAmountOfTokenB);
  });
});
