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
    const [deployer, user, lpProvider] = await viem.getWalletClients();
    if (!deployer.account) {
      throw new Error("Wallet client has no account");
    }

    const owner = deployer.account.address;
    const tokenA = await viem.deployContract("MockERC20", [
      "TokenA",
      "TKA",
      owner,
    ]);    

    const tokenB = await viem.deployContract("MockERC20", [
      "TokenB",
      "TKB",
      owner,
    ]);

    const amm = await viem.deployContract("SmithSwapV1Pair", [
      "TokenAmm",
      "TKAMM",
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
      lpProvider,
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
  
  it("liquidity", async function() {
    const { tokenA, tokenB, owner, user, lpProvider, amm } = await networkHelpers.loadFixture(deployAmmFixture);

    const tokenAAmount = parseEther("1.2");
    const tokenBAmount = parseEther("1.5");

    await tokenA.write.mint([lpProvider.account.address, tokenAAmount]);
    await tokenB.write.mint([lpProvider.account.address, tokenBAmount]);
  
    await tokenA.write.approve([amm.address, tokenAAmount], {account: lpProvider.account});
    await tokenB.write.approve([amm.address, tokenBAmount], {account: lpProvider.account});

    
    const smithPairBalanceOfTokenXBeforeAddingLiquidity = await tokenA.read.balanceOf([amm.address]);
    const smithPairBalanceOfTokenYBeforeAddingLiquidity = await tokenB.read.balanceOf([amm.address]);
    const lpProvideBalanceOfTokenABeforeAddLiquidity = await tokenA.read.balanceOf([lpProvider.account.address]);
    const lpProvideBalanceOfTokenBBeforeAddLiquidity = await tokenB.read.balanceOf([lpProvider.account.address]);
    const lpTokenBalanceBefore = await amm.read.balanceOf([lpProvider.account.address]); 
    await amm.write.addLiquidity([tokenAAmount, tokenBAmount], {account: lpProvider.account});

    const smithPairBalanceOfTokenXAfterAddingLiquidity = await tokenA.read.balanceOf([amm.address]);
    const smithPairBalanceOfTokenYAfterAddingLiquidity = await tokenB.read.balanceOf([amm.address]);

    const lpProvideBalanceOfTokenAAfterAddLiquidity = await tokenA.read.balanceOf([lpProvider.account.address]);
    const lpProvideBalanceOfTokenBAfterAddLiquidity = await tokenB.read.balanceOf([lpProvider.account.address]);
 
    assert.equal(tokenAAmount, lpProvideBalanceOfTokenABeforeAddLiquidity - lpProvideBalanceOfTokenAAfterAddLiquidity);
    assert.equal(tokenBAmount, lpProvideBalanceOfTokenBBeforeAddLiquidity - lpProvideBalanceOfTokenBAfterAddLiquidity);
  
    assert.equal(tokenAAmount, smithPairBalanceOfTokenXAfterAddingLiquidity - smithPairBalanceOfTokenXBeforeAddingLiquidity);
    assert.equal(tokenBAmount, smithPairBalanceOfTokenYAfterAddingLiquidity - smithPairBalanceOfTokenYBeforeAddingLiquidity);
    
   
    const lpTokenBalanceAfter = await amm.read.balanceOf([lpProvider.account.address]);

    const lpDelta = lpTokenBalanceAfter - lpTokenBalanceBefore;
    const totalSupply = await amm.read.totalSupply();
    const reserveX = await amm.read.reserveX();
    const reserveY = await amm.read.reserveY();
    const expectedDeltaX = tokenAAmount * totalSupply / reserveX; 
    const expectedDeltaY = tokenBAmount * totalSupply / reserveY; 
    const min = (a: bigint, b: bigint): bigint =>
       a < b ? a : b;
    const expectedDelta = min(expectedDeltaX, expectedDeltaY);
    assert.equal(lpDelta, expectedDelta)


    const removingLiquidity = parseEther("0.3");

    const lpProvideBalanceOfTokenABeforeRemovingLiquidity = await tokenA.read.balanceOf([lpProvider.account.address]);
    const lpProvideBalanceOfTokenBBeforeRemovingLiquidity = await tokenB.read.balanceOf([lpProvider.account.address]);
    const lpTokenBalanceBeforeRemovingLiquidity = await amm.read.balanceOf([lpProvider.account.address]); 

    await amm.write.removeLiquidity([lpProvider.account.address, removingLiquidity], {account: lpProvider.account});

    const _totalSupply = await amm.read.totalSupply();
    const _reserveX = await amm.read.reserveX();
    const _reserveY = await amm.read.reserveY();
    const dX = removingLiquidity * _reserveX / _totalSupply;
    const dY = removingLiquidity * _reserveY / _totalSupply;
 
    const lpProvideBalanceOfTokenAAfterRemovingLiquidity = await tokenA.read.balanceOf([lpProvider.account.address]);
    const lpProvideBalanceOfTokenBAfterRemovingLiquidity = await tokenB.read.balanceOf([lpProvider.account.address]);
    const lpTokenBalanceAfterRemovingLiquidity = await amm.read.balanceOf([lpProvider.account.address]); 
    assert.equal(removingLiquidity, lpTokenBalanceBeforeRemovingLiquidity - lpTokenBalanceAfterRemovingLiquidity);
    assert.equal(dX, lpProvideBalanceOfTokenAAfterRemovingLiquidity - lpProvideBalanceOfTokenABeforeRemovingLiquidity);
    assert.equal(dY, lpProvideBalanceOfTokenBAfterRemovingLiquidity - lpProvideBalanceOfTokenBBeforeRemovingLiquidity);
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
