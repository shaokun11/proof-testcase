// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract MerkleClaim {
    bytes32 public merkleRoot;

    mapping(address => uint256) public claimed;

    event MerkleRootUpdated(bytes32 merkleRoot);
    event Claimed(address indexed account, uint256 index, uint256 claimCount);

    constructor(bytes32 _merkleRoot) {
        merkleRoot = _merkleRoot;
    }

    function setMerkleRoot(bytes32 _merkleRoot) external {
        merkleRoot = _merkleRoot;
        emit MerkleRootUpdated(_merkleRoot);
    }

    function claim(uint256 index, bytes32[] calldata merkleProof) external {
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, index));
        require(
            MerkleProof.verify(merkleProof, merkleRoot, leaf),
            "Invalid proof"
        );
        claimed[msg.sender] += 1;

        emit Claimed(msg.sender, index, claimed[msg.sender]);
    }
}
