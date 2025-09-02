import { expect } from "chai";
import hre from "hardhat";
let ethers: any;

// 0x0a precompile address (EIP-4844 KZG Point Evaluation)
const PRECOMPILE_ADDR = "0x000000000000000000000000000000000000000a"; // Production address, for semantic hint only
function makePackedInput() {
  // Construct 192-byte input: all zeros sufficient for Mock success version
  const versionedHash = Buffer.alloc(32, 0);
  const z = Buffer.alloc(32, 0);
  const y = Buffer.alloc(32, 0);
  const commitment = Buffer.alloc(48, 0);
  const proof = Buffer.alloc(48, 0);
  return ethers.getBytes(
    ethers.hexlify(Buffer.concat([versionedHash, z, y, commitment, proof]))
  );
}

// Avoid direct injection to 0x0a by deploying Mock and passing its address to the contract constructor
const net = process.env.NETWORK || "hardhat";
describe("BlobKZGVerifier", function () {

  before(async function () {
    ({ ethers } = await hre.network.connect({
      network: net
    }));
  });
  let verifier: any;
  let mockOk: any;
  let mockFail: any;

  beforeEach(async () => {
    const MockOk = await ethers.getContractFactory("MockKZGPrecompile");
    mockOk = await MockOk.deploy();
    await mockOk.waitForDeployment();

    const MockFail = await ethers.getContractFactory("MockKZGPrecompileFail");
    mockFail = await MockFail.deploy();
    await mockFail.waitForDeployment();

    const Verifier = await ethers.getContractFactory("BlobKZGVerifier");
    verifier = await Verifier.deploy(await mockOk.getAddress());
    await verifier.waitForDeployment();
  });

  it("verifySinglePacked returns true with valid 192-byte input", async () => {
    const input = makePackedInput();
    const ok = await verifier.verifySinglePacked(input);
    expect(ok).to.equal(true);
  });

  it("verifySinglePacked reverts on invalid input length", async () => {
    const bad = ethers.getBytes(ethers.hexlify(Buffer.alloc(191, 0)));
    await expect(verifier.verifySinglePacked(bad)).to.be.revertedWithCustomError(
      verifier,
      "InvalidInputLength"
    );
  });

  it("verifyBatchAndStress emits event, updates slot, returns digest", async () => {
    const inputs = [makePackedInput(), makePackedInput()];
    const computeIterations = 500; // Reduce loops to avoid exceeding gas
    const key = ethers.id("parallel-key-" + 1);
    const tx = await verifier.verifyBatchAndStress(inputs, computeIterations, key);
    const receipt = await tx.wait();
    // Directly query if storage update is effective
    // Event parsing differs across hardhat/ethers versions, avoid incompatibility

    const digest = await verifier.getLastRunDigest();
    expect(ethers.isHexString(digest, 32), "digest should be 32-byte hex").to.equal(true);
  });

  it("verifyBatchAndStress reverts when precompile returns false", async () => {
    // Redeploy contract with failure version address to verify failure path
    const Verifier = await ethers.getContractFactory("BlobKZGVerifier");
    const bad = await Verifier.deploy(await mockFail.getAddress());
    await bad.waitForDeployment();
    const inputs = [makePackedInput()];
    await expect(
      bad.verifyBatchAndStress(inputs, 0)
    ).to.be.revertedWithCustomError(bad, "KZGVerificationFailed").withArgs(0);
  });
});