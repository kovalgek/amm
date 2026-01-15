// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.33;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SmithSwapV1ERC20} from "./SmithSwapV1ERC20.sol";

import "hardhat/console.sol";

/// @author kovalgek
contract SmithSwapV1Pair is SmithSwapV1ERC20 {
  address public immutable TOKEN_X;

  address public immutable TOKEN_Y;
  
  uint256 public constant BASIS_POINT_SCALE = 1e4;

  uint256 public constant SWAPPING_FEE = 30;
  uint256 public constant MINIMUM_LIQUIDITY = 10**3;
 
  uint256 public reserveX;

  uint256 public reserveY;
  
  error ErrorZeroAddress();
  error ErrorAmountIsZero();
  error ErrorWrongTokenPair();
  error ErrorInsufficientInput();
  error ErrorInsufficientInputAfterFee();

  constructor(string memory _name, string memory _symbol, address _tokenX, address _tokenY) SmithSwapV1ERC20(_name, _symbol) {
    if (_tokenX == address(0)) revert ErrorZeroAddress();
    if (_tokenY == address(0)) revert ErrorZeroAddress();
    TOKEN_X = _tokenX;
    TOKEN_Y = _tokenY;
  }

  function addLiquidity(uint256 _amountX, uint256 _amountY) external {
    if (_amountX == 0) revert ErrorAmountIsZero();
    if (_amountY == 0) revert ErrorAmountIsZero();

    IERC20(TOKEN_X).transferFrom(msg.sender, address(this), _amountX);
    IERC20(TOKEN_Y).transferFrom(msg.sender, address(this), _amountY);

    _mint(msg.sender);
 }

  /// token are sent before
  function _mint(address _to) private returns (uint256 liquidity) {
    uint256 currentBalanceX = IERC20(TOKEN_X).balanceOf(address(this));
    uint256 currentBalanceY = IERC20(TOKEN_Y).balanceOf(address(this));

    uint256 amountXIn = currentBalanceX - reserveX;
    uint256 amountYIn = currentBalanceY - reserveY;

    if (totalSupply == 0) {
      liquidity = Math.sqrt(amountXIn * amountYIn) - MINIMUM_LIQUIDITY;
      _mint(address(0), MINIMUM_LIQUIDITY);
    } else {
      liquidity = Math.min(amountXIn * totalSupply / reserveX, amountYIn * totalSupply / reserveY);
    }
    _mint(_to, liquidity);
    
    reserveX += amountXIn;
    reserveY += amountYIn;
  }

  function removeLiquidity(address _to, uint256 _liquidity) external {
    _transfer(msg.sender, address(this), _liquidity);
    _burn(_to);
  }
  
  function _burn(address _to) internal {
    uint256 balanceX = IERC20(TOKEN_X).balanceOf(address(this));
    uint256 balanceY = IERC20(TOKEN_Y).balanceOf(address(this));
    uint256 liquidity = balanceOf[address(this)];
    uint256 amountX = liquidity * balanceX / totalSupply;
    uint256 amountY = liquidity * balanceY / totalSupply;

    _burn(address(this), liquidity);

    IERC20(TOKEN_X).transfer(_to, amountX);
    IERC20(TOKEN_Y).transfer(_to, amountY);

    balanceX = IERC20(TOKEN_X).balanceOf(address(this));
    balanceY = IERC20(TOKEN_Y).balanceOf(address(this));
    reserveX = balanceX;
    reserveY = balanceY;
  }

  function swapXForY(uint256 _amountXIn, address _to) external {
    IERC20(TOKEN_X).transferFrom(msg.sender, address(this), _amountXIn);
    uint256 amountXInWithFee = _amountXIn * (BASIS_POINT_SCALE - SWAPPING_FEE);
    uint256 numerator = reserveY * amountXInWithFee;
    uint256 deniminator = reserveX * BASIS_POINT_SCALE + amountXInWithFee;
    uint256 amountYOut = numerator / deniminator;  
    _swap(0, amountYOut, _to);
  }

  function _swap(uint256 _amountXOut, uint256 _amountYOut, address _to) private {
    if (_amountXOut > 0) {
      IERC20(TOKEN_X).transfer(_to, _amountXOut);
    }
    if (_amountYOut > 0) {
      IERC20(TOKEN_Y).transfer(_to, _amountYOut);
    }

    uint256 currentBalanceX = IERC20(TOKEN_X).balanceOf(address(this));
    uint256 currentBalanceY = IERC20(TOKEN_Y).balanceOf(address(this));

    uint256 expectedBalanceX = reserveX - _amountXOut;
    uint256 expectedBalanceY = reserveY - _amountYOut;

    uint256 amountXIn = currentBalanceX > expectedBalanceX
        ? currentBalanceX - expectedBalanceX
        : 0;

    uint256 amountYIn = currentBalanceY > expectedBalanceY
        ? currentBalanceY - expectedBalanceY
        : 0;

    if (amountXIn == 0 && amountYIn == 0) revert ErrorInsufficientInput();

    uint256 balanceXAdjusted = currentBalanceX * BASIS_POINT_SCALE - amountXIn * SWAPPING_FEE;
    uint256 balanceYAdjusted = currentBalanceY * BASIS_POINT_SCALE - amountYIn * SWAPPING_FEE;
    if (balanceXAdjusted * balanceYAdjusted < reserveX * reserveY * BASIS_POINT_SCALE * BASIS_POINT_SCALE) {
      revert ErrorInsufficientInputAfterFee();
    }

    reserveX = currentBalanceX;
    reserveY = currentBalanceY;
  }
}
