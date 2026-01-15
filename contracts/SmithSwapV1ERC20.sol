// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.33;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISmithSwapV1ERC20} from "./interfaces/ISmithSwapV1ERC20.sol";

contract SmithSwapV1ERC20 is ISmithSwapV1ERC20 {
  string public NAME;
  string public SYMBOL;

  uint256 public totalSupply;
  mapping (address => uint256) public balanceOf;

  constructor(string memory _name, string memory _symbol) {
    NAME = _name;
    SYMBOL = _symbol;
  }
  
  function _mint(address _to, uint256 _amount) internal {
    totalSupply += _amount;
    balanceOf[_to] += _amount;
  }

  function _burn(address _from, uint256 _amount) internal {
    totalSupply -= _amount;
    balanceOf[_from] -= _amount;
  }

  function transfer(address _to, uint256 _amount) external {
    _transfer(msg.sender, _to, _amount);
  }

  function transferFrom(address _from, address _to, uint256 _amount) external {
    _transfer(_from, _to, _amount);
  }

  function _transfer(address _from, address _to, uint256 _amount) internal {
    balanceOf[_from] -= _amount;
    balanceOf[_to] += _amount;
  }
  
}
