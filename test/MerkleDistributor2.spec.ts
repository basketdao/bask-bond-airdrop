import chai, { expect } from 'chai'
import { solidity, MockProvider, deployContract } from 'ethereum-waffle'
import { Contract, BigNumber, constants } from 'ethers'
import BalanceTree from '../src/balance-tree'

import Distributor2 from '../build/MerkleDistributor2.json'
import TestERC20 from '../build/TestERC20.json'
import { parseBalanceMap } from '../src/parse-balance-map'

import BaskBondData from '../roots/bask-bond.json'
import SushiLPData from '../roots/sushi-lp-refunds.json'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999,
}

describe('MerkleDistributor2', () => {
  const provider = new MockProvider({
    ganacheOptions: {
      hardfork: 'istanbul',
      mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
      gasLimit: 9999999,
    },
  })

  const wallets = provider.getWallets()
  const [wallet0, wallet1] = wallets

  let baskBond: Contract
  let sushiLP: Contract

  beforeEach('deploy token', async () => {
    baskBond = await deployContract(wallet0, TestERC20, ['Token', 'TKN', 0], overrides)
    sushiLP = await deployContract(wallet0, TestERC20, ['Token', 'TKN', 0], overrides)
  })

  describe.only('#claimBoth', () => {
    it('claims both rewards', async () => {
      const merkle = await deployContract(
        wallet0,
        Distributor2,
        [baskBond.address, BaskBondData.merkleRoot, sushiLP.address, SushiLPData.merkleRoot],
        overrides
      )

      const baskBondMerkleTree = await merkle.baskBond()
      const sushiLPMerkleTree = await merkle.sushiLP()

      await baskBond.setBalance(baskBondMerkleTree, BaskBondData.tokenTotal)

      await sushiLP.setBalance(sushiLPMerkleTree, SushiLPData.tokenTotal)

      const testUser = '0x000f4432a40560bBFf1b581a8b7AdEd8dab80026'

      const { index: baskBondIndex, amount: baskBondAmount, proof: baskBondProof } = BaskBondData.claims[testUser]
      const { index: sushiLPIndex, amount: sushiLPAmount, proof: sushiLPProof } = SushiLPData.claims[testUser]

      const beforeSushiLP = await sushiLP.balanceOf(testUser)
      const beforeBaskBond = await baskBond.balanceOf(testUser)

      try {
        await merkle.claimBoth(
          BigNumber.from(baskBondIndex),
          testUser,
          BigNumber.from(baskBondAmount),
          baskBondProof,
          BigNumber.from(sushiLPIndex),
          testUser,
          BigNumber.from(sushiLPAmount),
          sushiLPProof
        )
      } catch (e) {
        throw new Error(e)
      }

      const afterSushiLP = await sushiLP.balanceOf(testUser)
      const afterBaskBond = await baskBond.balanceOf(testUser)

      const obtainedSushiLP = afterSushiLP.sub(beforeSushiLP)
      const obtainedBaskBond = afterBaskBond.sub(beforeBaskBond)

      expect(obtainedSushiLP.eq(BigNumber.from(sushiLPAmount))).to.be.true;
      expect(obtainedBaskBond.eq(BigNumber.from(baskBondAmount))).to.be.true;
    })
  })
})
