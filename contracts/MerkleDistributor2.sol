// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.6.11;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/cryptography/MerkleProof.sol";
import "./MerkleDistributor.sol";

contract MerkleDistributor2 {
    using SafeERC20 for IERC20;

    MerkleDistributor immutable public baskBond;
    MerkleDistributor immutable public sushiLP;

    address immutable public owner;

    constructor(
        address _baskBond,
        bytes32 _baskBondMerkleRoot,
        address _sushiLP,
        bytes32 _sushiLPMerkleRoot
    ) public {
        baskBond = new MerkleDistributor(_baskBond, _baskBondMerkleRoot);
        sushiLP = new MerkleDistributor(_sushiLP, _sushiLPMerkleRoot);

        owner = msg.sender;
    }

    function claimBoth(
        uint256 indexBaskBond,
        address accountBaskBond,
        uint256 amountBaskBond,
        bytes32[] calldata merkleProofBaskBond,
        uint256 indexSushiLP,
        address accountSushiLP,
        uint256 amountSushiLP,
        bytes32[] calldata merkleProofSushiLP
    ) external {
        baskBond.claim(indexBaskBond, accountBaskBond, amountBaskBond, merkleProofBaskBond);
        sushiLP.claim(indexSushiLP, accountSushiLP, amountSushiLP, merkleProofSushiLP);
    }

    function recoverERC20(address _token) public {
        require(msg.sender == owner);
        IERC20(_token).safeTransfer(_token, IERC20(_token).balanceOf(address(this)));
    }
}
