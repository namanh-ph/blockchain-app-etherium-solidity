# Commitment On Chain: Blockchain Application Using Ethereum Smart Contracts And Solidity

## Overview

Previously, this project intended to host a simple decentralised to-do list application using Ethereum smart contracts written in Solidity and served as a practical example of implementing smart contracts to manage and store data on the blockchain. However, to-do lists are easy to ignore and deadlines are easy to push, hence "Commitment On Chain" is updated. This is now a decentralised accountability dApp where users stake ETH against personal goals. The goal is marked done before the deadline and the stake is refunded; if the deadline passes, the stake goes to a backup wallet chosen up front.

## Features

- Set your goal: Write what you want to finish, pick a deadline, and lock a small ETH stake.
- Choose a backup wallet: Pick the address that gets your stake if you miss the deadline.
- Finish on time: Mark the goal done before the deadline and the stake is refunded, otherwise if the deadline passes, the payout is triggered to the backup wallet.

## Tech stack

- Contract: Ethereum's blockchain with smart contracts written in Solidity.
- Tooling: Truffle for compile/migrate/test, Ganache for the local chain, Mocha and Chai for the contract tests.
- Frontend: Plain HTML, CSS, and JavaScript; Web3.js for chain interaction; MetaMask for the wallet.
