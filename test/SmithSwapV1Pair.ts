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
    const [deployer, user, lpProvider, feeRecepient] = await viem.getWalletClients();
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
      tokenB.address,
      feeRecepient.account.address
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
      feeRecepient,
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

  it("protocol fee", async function() {
    const { tokenA, tokenB, user, lpProvider, amm, feeRecepient } = await networkHelpers.loadFixture(deployAmmFixture);

    await tokenA.write.mint([user.account.address, parseEther("100")]);
    await tokenB.write.mint([user.account.address, parseEther("100")]);

    // generate profit
    const swapAmount = parseEther("1");

    for (let i = 0; i < 10; i++) {
      await tokenA.write.approve([amm.address, swapAmount], {account: user.account});
      await amm.write.swapXForY([swapAmount, user.account.address], {account: user.account});

      await tokenB.write.approve([amm.address, swapAmount], {account: user.account});
      await amm.write.swapYForX([swapAmount, user.account.address], {account: user.account});
    }

    const tokenAAmount = parseEther("20");
    const tokenBAmount = parseEther("20");
    await tokenA.write.mint([lpProvider.account.address, tokenAAmount]);
    await tokenB.write.mint([lpProvider.account.address, tokenBAmount]);
    await tokenA.write.approve([amm.address, tokenAAmount], {account: lpProvider.account});
    await tokenB.write.approve([amm.address, tokenBAmount], {account: lpProvider.account});

    const reserveX = await amm.read.reserveX();
    const reserveY = await amm.read.reserveY();
    const prevK = await amm.read.prevK();
    const totalSupply = await amm.read.totalSupply();
    const rootPrevK = sqrtBigInt(prevK);
    const rootCurrentK = sqrtBigInt(reserveX * reserveY);
    const numerator = totalSupply * (rootCurrentK - rootPrevK);
    const denominator = 5n * rootCurrentK + rootPrevK;
    const liquidity = numerator / denominator;

    const feeRecipientBalanceBeforeAddLiquidity = await amm.read.balanceOf([feeRecepient.account.address]);
    await amm.write.addLiquidity([parseEther("1"), parseEther("1")], {account: lpProvider.account});
    const feeRecipientBalanceAfterAddLiquidity = await amm.read.balanceOf([feeRecepient.account.address]);

    assert.equal(liquidity, feeRecipientBalanceAfterAddLiquidity - feeRecipientBalanceBeforeAddLiquidity);
  });
  
  it("liquidity", async function() {
    const { tokenA, tokenB, lpProvider, amm } = await networkHelpers.loadFixture(deployAmmFixture);

    // add liquidity
    const tokenAAmount = parseEther("1.2");
    const tokenBAmount = parseEther("1.5");

    await tokenA.write.mint([lpProvider.account.address, tokenAAmount]);
    await tokenB.write.mint([lpProvider.account.address, tokenBAmount]);
    await tokenA.write.approve([amm.address, tokenAAmount], {account: lpProvider.account});
    await tokenB.write.approve([amm.address, tokenBAmount], {account: lpProvider.account});

    const ammXBeforeAddLiquidity = await tokenA.read.balanceOf([amm.address]);
    const ammYBeforeAddLiquidity = await tokenB.read.balanceOf([amm.address]);
    const lpProviderXBeforeAddLiquidity = await tokenA.read.balanceOf([lpProvider.account.address]);
    const lpProviderYBeforeAddLiquidity = await tokenB.read.balanceOf([lpProvider.account.address]);
    const lpProviderLPBeforeAddLiquidity = await amm.read.balanceOf([lpProvider.account.address]); 

    await amm.write.addLiquidity([tokenAAmount, tokenBAmount], {account: lpProvider.account});

    const ammXAfterAddLiquidity = await tokenA.read.balanceOf([amm.address]);
    const ammYAfterAddLiquidity = await tokenB.read.balanceOf([amm.address]);
    const lpProviderXAfterAddLiquidity = await tokenA.read.balanceOf([lpProvider.account.address]);
    const lpProviderYAfterAddLiquidity = await tokenB.read.balanceOf([lpProvider.account.address]);
    const lpProviderLPAfterAddLiquidity = await amm.read.balanceOf([lpProvider.account.address]);

    assert.equal(tokenAAmount, lpProviderXBeforeAddLiquidity - lpProviderXAfterAddLiquidity);
    assert.equal(tokenBAmount, lpProviderYBeforeAddLiquidity - lpProviderYAfterAddLiquidity);
    assert.equal(tokenAAmount, ammXAfterAddLiquidity - ammXBeforeAddLiquidity);
    assert.equal(tokenBAmount, ammYAfterAddLiquidity - ammYBeforeAddLiquidity);
    
    const lpDelta = lpProviderLPAfterAddLiquidity - lpProviderLPBeforeAddLiquidity;
    let totalSupply = await amm.read.totalSupply();
    let reserveX = await amm.read.reserveX();
    let reserveY = await amm.read.reserveY();
    const expectedDeltaX = tokenAAmount * totalSupply / reserveX; 
    const expectedDeltaY = tokenBAmount * totalSupply / reserveY; 
    const min = (a: bigint, b: bigint): bigint =>
       a < b ? a : b;
    const expectedDelta = min(expectedDeltaX, expectedDeltaY);
    assert.equal(lpDelta, expectedDelta);

    // remove liquidity
    const removingLiquidity = parseEther("0.3");

    const ammXBeforeRemoveLiquidity = await tokenA.read.balanceOf([amm.address]);
    const ammYBeforeRemoveLiquidity = await tokenB.read.balanceOf([amm.address]);
    const lpProviderXBeforeRemoveLiquidity = await tokenA.read.balanceOf([lpProvider.account.address]);
    const lpProviderYBeforeRemoveLiquidity = await tokenB.read.balanceOf([lpProvider.account.address]);
    const lpProviderLPBeforeRemoveLiquidity = await amm.read.balanceOf([lpProvider.account.address]); 

    await amm.write.removeLiquidity([lpProvider.account.address, removingLiquidity], {account: lpProvider.account});

    totalSupply = await amm.read.totalSupply();
    reserveX = await amm.read.reserveX();
    reserveY = await amm.read.reserveY();
    const dX = removingLiquidity * reserveX / totalSupply;
    const dY = removingLiquidity * reserveY / totalSupply;
 
    const ammXAfterRemoveLiquidity = await tokenA.read.balanceOf([amm.address]);
    const ammYAfterRemoveLiquidity = await tokenB.read.balanceOf([amm.address]);
    const lpProviderXAfterRemoveLiquidity = await tokenA.read.balanceOf([lpProvider.account.address]);
    const lpProviderYAfterRemoveLiquidity = await tokenB.read.balanceOf([lpProvider.account.address]);
    const lpProviderLPAfterRemoveLiquidity = await amm.read.balanceOf([lpProvider.account.address]); 
    assert.equal(removingLiquidity, lpProviderLPBeforeRemoveLiquidity - lpProviderLPAfterRemoveLiquidity);
    assert.equal(dX, lpProviderXAfterRemoveLiquidity - lpProviderXBeforeRemoveLiquidity);
    assert.equal(dY, lpProviderYAfterRemoveLiquidity - lpProviderYBeforeRemoveLiquidity);
    assert.equal(ammXBeforeRemoveLiquidity - ammXAfterRemoveLiquidity, dX);
    assert.equal(ammYBeforeRemoveLiquidity - ammYAfterRemoveLiquidity, dY);
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

export function sqrtBigInt(value: bigint): bigint {
  if (value < 0n) {
    throw new Error("sqrt of negative numbers is not supported");
  }
  if (value < 2n) {
    return value;
  }

  let x0 = value;
  let x1 = (x0 + value / x0) >> 1n;

  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + value / x0) >> 1n;
  }

  return x0;
}
