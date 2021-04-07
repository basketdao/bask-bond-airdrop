// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.6.11;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract BaskBOND is ERC20 {
    constructor () ERC20("BASK Bond", "BASKBond") public {
        _mint(msg.sender, 70253694259365537760000);
    }
}
