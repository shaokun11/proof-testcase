import "dotenv/config";
import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";
import { network } from "hardhat";


const net = process.env.NETWORK || "hardhat";
const conflictRate = parseFloat(process.env.CONFLICT_RATE || "0");
const txCount = parseInt(process.env.TX_COUNT || "10");

const { ethers } = await network.connect({
    network: net,
});

const [sender] = await ethers.getSigners();
interface Claim {
    index: number;
    account: string;
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
    const n = Math.floor(txCount * (1 - conflictRate));
    const amount = "0.1";
    const provider = ethers.provider!;

    console.log("create %d wallets", n);
    const wallets = Array.from({ length: n }, () =>
        ethers.Wallet.createRandom().connect(provider)
    );

    await faucet(wallets.map((w) => w.address), amount);
    const claims: Claim[] = wallets.map((w, index) => {
        return {
            index,
            account: w.address,
        };
    });
    const leaves = claims.map((c) =>
        keccak256(
            ethers.solidityPacked(["address", "uint256"], [c.account, c.index])
        )
    );
    const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
    const root = tree.getHexRoot();
    console.log("Merkle Root:", root);

    const MerkleClaim = await ethers.getContractFactory("MerkleClaim");
    const mc = await MerkleClaim.deploy(root);
    await mc.waitForDeployment();
    console.log("deploy proof contract address is:", await mc.getAddress());
    let block = await sender.provider!.getBlockNumber();
    console.log("send tx previous block number is:", block);

    // no conflict tx
    for (let i = 0; i < wallets.length; i++) {
        const c = claims[i];
        const leaf = keccak256(
            ethers.solidityPacked(["address", "uint256"], [c.account, c.index])
        );
        const proof = tree.getHexProof(leaf);
        const mcWithWallet = mc.connect(wallets[i]);
        let tx = await mcWithWallet.claim(c.index, proof);
        if (i + 1 === wallets.length && j + 1 === 100) {
            await tx.wait();
        }
    }
    block = await sender.provider!.getBlockNumber();
    console.log("claim block number is:", block);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
