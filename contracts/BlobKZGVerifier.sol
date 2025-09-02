// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * BlobKZGVerifier
 *
 * Practical application scenarios:
 * - KZG point verification (EIP-4844) for data points extracted from blobs in Rollup/data availability layers.
 * - Contract side can perform batch verification of submitted commitments and proofs for price feeds, proof aggregation, L2 cross-domain message validity checks, etc.
 *
 * Design goals:
 * - High CPU utilization: Execute adjustable intensity pure computation (hash and arithmetic mix) after each successful verification for stress testing.
 * - Minimize slot writes: The entire batch process only writes to a single storage slot at the end (saving the digest of this run), avoiding multiple sstores within loops.
 * - Use KZG point verification precompile from EIP-4844 (address 0x0a).
 *
 * Call format (packed input for single verification):
 *   input is fixed length 192 bytes, concatenated in order:
 *     - versionedHash: 32 bytes (versioned hash of commitment, used to bind blob in EIP-4844)
 *     - z: 32 bytes (evaluation point)
 *     - y: 32 bytes (polynomial value at point z)
 *     - commitment: 48 bytes (KZG commitment, BLS12-381 G1 compressed format)
 *     - proof: 48 bytes (KZG proof, BLS12-381 G1 compressed format)
 * Returns: Precompile returns 32 bytes, where value 1 indicates verification passed, 0 indicates failure.
 */
contract BlobKZGVerifier {
    mapping(bytes32 => bytes32) private runDigestByKey;
    // Single slot: Record the digest of the most recent batch verification + computation
    bytes32 private lastRunDigest;
    // KZG point evaluation target address (production can point to 0x0a; test can inject Mock address)
    address public immutable kzgPointEvalAddress;

    error InvalidInputLength(uint256 expected, uint256 actual);
    error KZGVerificationFailed(uint256 index);

    event BatchVerified(uint256 items, bytes32 digest);

    constructor(address kzgAddr) {
        kzgPointEvalAddress = kzgAddr;
    }

    /// @notice Read-only verification of single KZG point proof (packed input = 192 bytes)
    /// @param input 192-byte packed: versionedHash(32) | z(32) | y(32) | commitment(48) | proof(48)
    /// @return ok Precompile returns 1 for pass
    function verifySinglePacked(bytes calldata input) external view returns (bool ok) {
        if (input.length != 192) revert InvalidInputLength(192, input.length);
        return _kzgPointEvaluation(input);
    }

    /// @notice Batch verification and CPU-intensive computation, only performs one slot write at the end
    /// @param packedInputs Each item is a packed input of length 192
    /// @param computeIterations Number of CPU-intensive iterations after each successful verification (can be used to adjust stress)
    /// @return digest Final digest obtained from this batch verification and computation
    function verifyBatchAndStress(bytes[] calldata packedInputs, uint256 computeIterations, bytes32 key) external returns (bytes32 digest) {
        bytes32 localDigest = keccak256(abi.encodePacked(block.chainid, block.number, packedInputs.length, computeIterations));

        for (uint256 i = 0; i < packedInputs.length; i++) {
            bytes calldata item = packedInputs[i];
            if (item.length != 192) revert InvalidInputLength(192, item.length);

            bool ok = _kzgPointEvaluation(item);
            if (!ok) revert KZGVerificationFailed(i);

            // Incorporate input into digest
            localDigest = keccak256(abi.encodePacked(localDigest, keccak256(item), i));

            // CPU intensive: Mix of hashing and arithmetic, avoid storage writes, only perform memory/stack calculations
            uint256 accumulator = uint256(localDigest);
            unchecked {
                for (uint256 j = 0; j < computeIterations; j++) {
                    // Repeated hash mixing
                    accumulator = uint256(keccak256(abi.encodePacked(accumulator, i, j)));
                    // Simple large number modular arithmetic mixing (select large constants to increase arithmetic overhead)
                    accumulator = mulmod(
                        accumulator,
                        0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF,
                        type(uint256).max - 189
                    );
                    accumulator = addmod(accumulator, i + j + 0x1234, type(uint256).max - 29);
                }
            }
            localDigest = bytes32(accumulator);
        }

        runDigestByKey[key] = localDigest;
        emit BatchVerified(packedInputs.length, localDigest);
        return localDigest;
    }

    /// @notice Read the digest of the most recent batch run
    function getLastRunDigest() external view returns (bytes32) {
        return lastRunDigest;
    }

    /// @dev EIP-4844 KZG point verification precompile wrapper (address injected by constructor, can be 0x0a in production).
    /// Requires input length to be 192 bytes, returns true if precompile return value is 1.
    function _kzgPointEvaluation(bytes calldata input) internal view returns (bool) {
        // Static call through address injected by constructor, avoiding direct reading of immutable variables in inline assembly
        address target = kzgPointEvalAddress;
        (bool ok, bytes memory out) = target.staticcall(input);
        if (!ok || out.length < 32) return false;
        uint256 retWord;
        assembly {
            retWord := mload(add(out, 32))
        }
        return retWord == 1;
    }
}