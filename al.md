### prepare

```bash
git clone https://github.com/Altius-Parallel-EVM/reth

cd reth

git checkout winless-new-node

cargo build --release altius-node

```

### start node
>
> jwt.hex you can generate by `openssl rand -hex 32`

> set the env ENABLE_PARALLEL to true if you want to use parallel engine , every time you should clear the data dir

```bash
export DATA_DIR=/home/ubuntu/datadir
export RUST_LOG=INFO
export ENABLE_PARALLEL=false
export ENABLE_SSA=false
export JWT_SECRET=/home/ubuntu/jwt.hex
cache=--engine.caching-and-prewarming
./target/release/altius-node node $cache --datadir $DATA_DIR --http --http.api all --disable-discovery --trusted-only --authrpc.jwtsecret=$JWT_SECRET --chain altius --engine.persistence-threshold 0 --engine.memory-block-buffer-target 0 --block-interval 5 --prune.senderrecovery.full --prune.transactionlookup.full --prune.receipts.distance=10064 --prune.accounthistory.distance=10064 --prune.storagehistory.distance=10064
```

### config the aleth cli
>
> config the cli engine api jwt secret

```bash
cat $JWT_SECRET
aleth config -e 
```

### test
>
> paylaod could get from alitus-payload.zip

```bash
unzip alitus-payload.zip
aleth block submit-blocks -d payload -f 1 -t 4 
```

~~
