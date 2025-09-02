import "dotenv/config";
import { network } from "hardhat";

const net = process.env.NETWORK || "hardhat";
const verifyIterateCount = parseInt(process.env.VERIFY_ITERATE_COUNT || "500");
const { ethers } = await network.connect({
    network: net,
});

const [sender] = await ethers.getSigners();

function makePackedInput() {
    const versionedHash = Buffer.alloc(32, 0);
    const z = Buffer.alloc(32, 0);
    const y = Buffer.alloc(32, 0);
    const commitment = Buffer.alloc(48, 0);
    const proof = Buffer.alloc(48, 0);
    return ethers.getBytes(
        ethers.hexlify(Buffer.concat([versionedHash, z, y, commitment, proof]))
    );
}


async function main() {
    console.log("network:", net, ",", "count:", verifyIterateCount);
    const MockOk = await ethers.getContractFactory("MockKZGPrecompile");
    const mockOk = await MockOk.deploy();
    await mockOk.waitForDeployment();
    console.log("deployed ok precompile at:", await mockOk.getAddress());
    const Verifier = await ethers.getContractFactory("BlobKZGVerifier");
    const verifier = await Verifier.deploy(await mockOk.getAddress());
    await verifier.waitForDeployment();
    console.log("deployed verifier at:", await verifier.getAddress());
    const inputs = [makePackedInput(), makePackedInput()];
    const computeIterations = verifyIterateCount;
    let block = await sender.provider!.getBlockNumber();
    console.log("send tx previous block number is:", block);
    const tx = await verifier.verifyBatchAndStress(inputs, computeIterations);
    await tx.wait();
    block = await sender.provider!.getBlockNumber();
    console.log("send tx block number is:", block);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});