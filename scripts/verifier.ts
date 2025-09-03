import "dotenv/config";
import { network } from "hardhat";

const net = process.env.NETWORK || "hardhat";
const verifyIterateCount = parseInt(process.env.VERIFY_ITERATE_COUNT || "1000");
let txCount = parseInt(process.env.TX_COUNT || "10");
if (verifyIterateCount === 1000 && txCount > 854) {
    // when the verifyIterateCount is 1000 , the block could include up to 854 transactions
    txCount = 854;
}
const conflictRate = parseFloat(process.env.CONFLICT_RATE || "0");
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

async function faucet(arr: string[], amount: string) {
    const bal = await sender.provider!.getBalance(sender.address);
    console.log("sender balance is:", ethers.formatEther(bal));
    const nonce = await sender.getNonce();
    console.log("start faucet");
    for (let i = 0; i < arr.length; i++) {
        const tx = await sender.sendTransaction({
            to: arr[i],
            value: ethers.parseEther(amount),
            nonce: nonce + i,
        });
        if (i + 1 === arr.length) {
            await tx.wait();
        }
    }
    console.log("faucet end");
}

async function main() {
    const provider = ethers.provider!;
    const wallets = Array.from({ length: txCount }, () =>
        ethers.Wallet.createRandom().connect(provider)
    );
    await faucet(wallets.map((w) => w.address), '10.0');
    console.log("network:", net, "iterate count:", verifyIterateCount, "wallet count", wallets.length, "conflict rate:", conflictRate);
    const MockOk = await ethers.getContractFactory("MockKZGPrecompile");
    const mockOk = await MockOk.deploy();
    await mockOk.waitForDeployment();
    console.log("deployed ok precompile at:", await mockOk.getAddress());
    const Verifier = await ethers.getContractFactory("BlobKZGVerifier");
    const verifier = await Verifier.deploy(await mockOk.getAddress());
    await verifier.waitForDeployment();
    console.log("deployed verifier at:", await verifier.getAddress());

    const conflictN = Math.floor(txCount * conflictRate);
    const conflictKeys = wallets.map((w, i) => {
        if (i < conflictN) {
            return ethers.id("conflict-key")
        }
        return ethers.id("non-conflict-key" + i.toString());
    });
    const inputs = [makePackedInput(), makePackedInput()];
    for (let i = 0; i < wallets.length; i++) {
        const mcWithWallet = verifier.connect(wallets[i]);
        const key = conflictKeys[i];
        const tx = await mcWithWallet.verifyBatchAndStress(inputs, verifyIterateCount, key);
        if (i + 1 === wallets.length) {
            await tx.wait();
        }
    }
    let block = await sender.provider!.getBlockNumber();
    console.log("send conflict tx block number is:", block);
    // for (let i = 0; i < wallets.length; i++) {
    //     const mcWithWallet = verifier.connect(wallets[i]);
    //     const key = ethers.id("non-conflict-key" + i.toString());
    //     const tx = await mcWithWallet.verifyBatchAndStress(inputs, verifyIterateCount, key);
    //     if (i + 1 === wallets.length) {
    //         await tx.wait();
    //     }
    // }
    // block = await sender.provider!.getBlockNumber();
    // console.log("send no-conflict tx block number is:", block);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});