// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title MockKZGPrecompile - Success version: returns 1 if calldata length is 192, otherwise returns 0
contract MockKZGPrecompile {
    fallback() external payable {
        assembly {
            let out := mload(0x40)
            mstore(out, eq(calldatasize(), 192))
            return(out, 0x20)
        }
    }
}

/// @title MockKZGPrecompileFail - Failure version: unconditionally returns 0
contract MockKZGPrecompileFail {
    fallback() external payable {
        assembly {
            let out := mload(0x40)
            mstore(out, 0)
            return(out, 0x20)
        }
    }
}