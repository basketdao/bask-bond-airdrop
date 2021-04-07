import fs from 'fs'
import path from 'path'
import { ethers } from 'ethers'

import fetch from 'node-fetch'

const { formatUnits, parseUnits } = ethers.utils

const DPI = '0x1494CA1F11D487c2bBe4543E90080AeBa4BA3C2b'.toLowerCase()
const UNIV2_DPI = '0x4d5ef58aAc27d99935E5b6B4A6778ff292059991'.toLowerCase()
const MASTERCHEF = '0xDB9daa0a50B33e4fe9d0ac16a1Df1d335F96595e'.toLowerCase()
const MIGRATOR = '0x3ef214951fb258ef240da90d8c6305eb6d08fe63'.toLowerCase()

// USD Prices
const DPI_PRICE = 447.4023
const UNIV2_PRICE = 2092.8046328640285

// Refund SUSHI prices
const REFUND_SUSHI_LP = ethers.BigNumber.from('826588319661451497160')

const START_BLOCK = 12086613
const END_BLOCK = 12177548
const ATTACK_BLOCK = 12175000

const ETHERSCAN_API_KEY = '9D13ZE7XSBTJ94N9BNJ2MA33VMAY2YPIRB'

const getTransferEvents = async () => {
  const URL = `https://api.etherscan.io/api?module=account&action=tokentx&address=${MASTERCHEF}&startblock=${START_BLOCK}&endblock=${END_BLOCK}&sort=asc&apikey=${ETHERSCAN_API_KEY}`

  const data = await fetch(URL).then((x) => x.json())

  return data.result
}

const getMigrators = async (erc20) => {
  const events = await getTransferEvents()

  // es-lint-disable-next-line
  const relatedEvents = events.filter((x) => {
    return (
      (x.from.toLowerCase() === MASTERCHEF || x.to.toLowerCase() === MASTERCHEF) &&
      x.contractAddress.toLowerCase() === erc20
    )
  })

  // Depositors
  const depositors = relatedEvents.reduce((acc, x) => {
    if (parseInt(x.blockNumber) > END_BLOCK) {
      return acc
    }

    // Ignore migrator
    if (x.to.toLowerCase() === MIGRATOR || x.from.toLowerCase() === MIGRATOR) {
      return acc
    }

    // Deposit
    if (x.to.toLowerCase() === MASTERCHEF) {
      // Someone tried to game the system by depositing exactly 1 DPI into the system at the few hours
      // Just filter out exactly 1 DPI
      if (erc20 === DPI && x.value === parseUnits('1').toString() && parseInt(x.blockNumber) > ATTACK_BLOCK) {
        return acc
      } 
      // Someone did the same thing for UNIV2_DPI in 0.01 amounts and 0.02 amounts
      else if (erc20 === UNIV2_DPI && x.value === parseUnits('0.01').toString() && parseInt(x.blockNumber) > ATTACK_BLOCK) {
        return acc
      }
      else if (erc20 === UNIV2_DPI && x.value === parseUnits('0.02').toString() && parseInt(x.blockNumber) > ATTACK_BLOCK) {
        return acc
      }
      
      else {
        acc[x.from.toLowerCase()] = (acc[x.from.toLowerCase()] || ethers.constants.Zero).add(
          ethers.BigNumber.from(x.value)
        )
      }
    } else if (x.from.toLowerCase() === MASTERCHEF) {
      // Withdraw
      acc[x.to.toLowerCase()] = acc[x.to.toLowerCase()].sub(ethers.BigNumber.from(x.value))
    }
    return acc
  }, {})

  // Remove 0
  return Object.keys(depositors).reduce((acc, x) => {
    if (depositors[x].lte(ethers.constants.Zero)) {
      return acc
    }
    return { ...acc, [x]: depositors[x] }
  }, {})
}

const main = async () => {
  // Get depositors
  const dpiDepositors = await getMigrators(DPI)
  const univ2Depositors = await getMigrators(UNIV2_DPI)

  // Refunding them proportionally
  const totalUniV2Deposits = Object.keys(univ2Depositors).reduce((acc, x) => {
    return acc.add(univ2Depositors[x])
  }, ethers.constants.Zero)

  const refundsInString = Object.keys(univ2Depositors).reduce((acc, x) => {
    const ratio = univ2Depositors[x].mul(parseUnits('1')).div(totalUniV2Deposits)
    return {
      ...acc,
      [x]: ratio.mul(REFUND_SUSHI_LP).div(parseUnits('1')).toString(),
    }
  }, {})

  // Converting them into USD
  const dpiDepositorsUSD = Object.keys(dpiDepositors).reduce((acc, x) => {
    const usd = parseFloat(formatUnits(dpiDepositors[x])) * DPI_PRICE
    return { ...acc, [x]: usd }
  }, {})
  const univ2DepositorsUSD = Object.keys(univ2Depositors).reduce((acc, x) => {
    const usd = parseFloat(formatUnits(univ2Depositors[x])) * UNIV2_PRICE
    return { ...acc, [x]: usd }
  }, {})

  // Get all unique addresses and add their USD value
  const depositorsUSD = [...Object.keys(dpiDepositorsUSD), ...Object.keys(univ2DepositorsUSD)]
    .map((x) => x.toLowerCase())
    .filter((v, i, a) => a.indexOf(v) === i)
    .reduce((acc, x) => {
      const dpiUSD = dpiDepositorsUSD[x] || 0
      const univ2USD = univ2DepositorsUSD[x] || 0

      return { ...acc, [x]: dpiUSD + univ2USD }
    }, {})

  const totalUSD = Object.keys(depositorsUSD).reduce((acc, x) => {
    return acc + depositorsUSD[x]
  }, 0)

  const baskBondDistribution = Object.keys(depositorsUSD).reduce((acc, x) => {
    return { ...acc, [x]: Math.sqrt(depositorsUSD[x]) }
  }, {})

  console.log('totalUSD', totalUSD)

  // Checks
  fs.writeFileSync(
    path.resolve(__dirname, `dpi-depositors.json`),
    JSON.stringify(
      Object.keys(dpiDepositors).reduce((acc, x) => {
        return { ...acc, [x]: dpiDepositors[x].toString() }
      }, {}),
      null,
      4
    )
  )

  fs.writeFileSync(
    path.resolve(__dirname, `univ2-dpi-depositors.json`),
    JSON.stringify(
      Object.keys(univ2Depositors).reduce((acc, x) => {
        return { ...acc, [x]: univ2Depositors[x].toString() }
      }, {}),
      null,
      4
    )
  )

  // Refunds
  fs.writeFileSync(path.resolve(__dirname, `sushi-lp-refunds.json`), JSON.stringify(refundsInString, null, 4))
  fs.writeFileSync(path.resolve(__dirname, `migrators-in-usd.json`), JSON.stringify(depositorsUSD, null, 4))
  fs.writeFileSync(
    path.resolve(__dirname, `bask-bond-distribution.json`),
    JSON.stringify(baskBondDistribution, null, 4)
  )
}

main()
