const { ethers } = require('ethers');
const fs = require('fs');
const log = require('log-to-file');
require('dotenv').config();

// ===== KONFIGURASI =====
// Konfigurasi 0G Labs
const OG_LABS_RPC_URL = process.env.OG_LABS_RPC_URL || "https://evmrpc-testnet.0g.ai";
const OG_LABS_CHAIN_ID = parseInt(process.env.OG_LABS_CHAIN_ID || "80087");
const TOKEN_ADDRESSES = {
    "USD": process.env.TOKEN_USD || "0xa8f030218d7c26869cadd46c5f10129e635cd565",
    "ETH": process.env.TOKEN_ETH || "0x2619090fcfdb99a8ccf51c76c9467f7375040eeb",
    "BTC": process.env.TOKEN_BTC || "0x6dc29491a8396Bd52376b4f6dA1f3E889C16cA85" 
};

// Konfigurasi Swap
const SWAP_ROUTER = process.env.SWAP_ROUTER;
const SWAP_PERCENT = parseFloat(process.env.SWAP_PERCENT || "1"); // Default 1% dari balance

const ERC20_ABI = [
    "function transfer(address to, uint amount) returns (bool)",
    "function balanceOf(address account) view returns (uint)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function approve(address spender, uint256 amount) returns (bool)"
];

// Router ABI dengan penambahan fungsi yang sesuai method ID 0x1249c58b
const ROUTER_ABI = [
    // Other functions...
    
    // Replace the existing swapExactTokensForTokensV3 with this
    "function swap(address tokenIn, address tokenOut, uint256 flags, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMin, uint8 v) external returns (uint256 amountOut)",
];

// Provider untuk 0G Labs
const provider = new ethers.providers.JsonRpcProvider(OG_LABS_RPC_URL);

// ===== KONSTANTA =====
// Konstanta dari env atau default
const DURATION = parseInt(process.env.DURATION || "30000"); // 5 menit default
const MIN_BALANCE = parseFloat(process.env.MIN_BALANCE || "0.000001");
const MAX_BALANCE = parseFloat(process.env.MAX_BALANCE || "0.00001");
const GAS_PRICE = parseInt(process.env.GAS_PRICE || "1000000000");
const GAS_LIMIT = parseInt(process.env.GAS_LIMIT || "300000");
const SWAP_MODE = process.env.SWAP_MODE || "ALL"; // ETH_TO_USD, BTC_TO_USD, USD_TO_ETH, USD_TO_BTC, RANDOM, ALL

// Daftar untuk melacak alamat yang sudah melakukan transfer native
const processedWallets = new Set();

// Daftar alamat random untuk transfer (contoh, bisa diganti dengan alamat sebenarnya)
// Dalam produksi sebenarnya, Anda harus mengisi list ini dengan alamat yang valid
const RANDOM_ADDRESSES = [
    "0x23eAb9DF00E86bB594220441dD50FA9Cee79c12C",
    "0x1991240D205A448d24b3ef938022D444ba67De2A",
    "0x5b6c42f5501929b0726af823f8f4002fd6419d7f",
    "0x41446af8e24ce658e73C208c32b56219387cAD97",
    "0xD1969e0C12E16efD9de7A74d98156B526006b202",
    // Tambahkan lebih banyak alamat jika diperlukan
];

// Fungsi untuk mendapatkan alamat random dari list
function getRandomAddress() {
    const randomIndex = Math.floor(Math.random() * RANDOM_ADDRESSES.length);
    return RANDOM_ADDRESSES[randomIndex];
}

// ===== FUNGSI WALLET =====
// Setup wallet
async function walletSetup() {
    try {
        // Buat atau gunakan private key dari env
        const privateKeys = [];
        
        // Cek primary keys (minimal 2 key yang diperlukan)
        const privateKey1 = process.env.PRIVATE_KEY_1;
        const privateKey2 = process.env.PRIVATE_KEY_2;
        
        if (!privateKey1 || !privateKey2) {
            console.error("Private keys tidak ditemukan di .env, silakan tambahkan PRIVATE_KEY_1 dan PRIVATE_KEY_2");
            process.exit(1);
        }
        
        privateKeys.push(privateKey1, privateKey2);
        
        // Cek tambahan private keys (opsional)
        for (let i = 3; i <= 10; i++) {
            const key = process.env[`PRIVATE_KEY_${i}`];
            if (key) {
                privateKeys.push(key);
            }
        }
        
        // Buat wallet untuk setiap private key
        const wallets = privateKeys.map(key => new ethers.Wallet(key, provider));
        
        console.log(`Loaded ${wallets.length} wallets for operations`);
        return wallets;
    } catch (error) {
        console.error(`Error saat setup wallet: ${error.message}`);
        log(`Error saat setup wallet: ${error.message}`, './oglabs_error.log');
        process.exit(1);
    }
}

// ===== FUNGSI BALANCE =====
// Dapatkan balance native
async function getBalanceAddress(address) {
    try {
        const balance = await provider.getBalance(address);
        return ethers.utils.formatEther(balance);
    } catch (error) {
        console.error(`Error saat mendapatkan balance: ${error.message}`);
        log(`Error saat mendapatkan balance: ${error.message}`, './oglabs_error.log');
        throw error;
    }
}

// Dapatkan balance token
async function getTokenBalance(address, tokenAddress) {
    try {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const decimals = await tokenContract.decimals();
        const symbol = await tokenContract.symbol();
        const balance = await tokenContract.balanceOf(address);
        
        return {
            balance: ethers.utils.formatUnits(balance, decimals),
            symbol: symbol,
            decimals: decimals,
            rawBalance: balance
        };
    } catch (error) {
        console.error(`Error saat mendapatkan token balance: ${error.message}`);
        log(`Error saat mendapatkan token balance: ${error.message}`, './oglabs_error.log');
        throw error;
    }
}

// ===== FUNGSI JUMLAH TRANSFER =====
// Hitung jumlah transfer dengan batasan desimal
function transferAmount() {
    const amount = parseFloat(MIN_BALANCE) + 
           Math.random() * (parseFloat(MAX_BALANCE) - parseFloat(MIN_BALANCE));
    // Batasi ke 5 angka desimal untuk mencegah error
    return parseFloat(amount.toFixed(5));
}

// ===== FUNGSI TRANSFER =====
// Transfer native coin
async function transferNative(senderWallet, receiverAddress, amount) {
    try {
        // Pastikan jumlah transfer memiliki format yang benar
        const amountStr = amount.toFixed(5);
        
        const tx = {
            to: receiverAddress,
            value: ethers.utils.parseEther(amountStr),
            gasLimit: GAS_LIMIT,
            gasPrice: GAS_PRICE,
            nonce: await provider.getTransactionCount(senderWallet.address),
            chainId: OG_LABS_CHAIN_ID
        };
        
        const transaction = await senderWallet.sendTransaction(tx);
        console.log(`Native transaction sent from ${senderWallet.address} to ${receiverAddress}: ${transaction.hash}`);
        log(`Native transaction sent from ${senderWallet.address} to ${receiverAddress}: ${transaction.hash}`, './oglabs.log');
        
        // Tandai wallet ini sebagai sudah melakukan transfer native
        processedWallets.add(senderWallet.address);
        
        return transaction;
    } catch (error) {
        console.error(`Error saat transfer native: ${error.message}`);
        log(`Error saat transfer native: ${error.message}`, './oglabs_error.log');
        throw error;
    }
}

function calculateMinimumOut(amountIn) {
    // Toleransi slippage default 0.5%
    const slippageTolerance = 0.005;
    
    // Hitung output minimum (amountIn * (1 - slippageTolerance))
    // Ini memungkinkan slippage 0.5%
    return amountIn.mul(ethers.BigNumber.from(1000 - Math.floor(slippageTolerance * 1000)))
                   .div(ethers.BigNumber.from(1000));
}

async function swapTokenToToken(senderWallet, tokenInAddress, tokenOutAddress, amountIn) {
    // Cek apakah alamat router sudah diatur
    if (!SWAP_ROUTER) {
        console.log("Swap router address tidak diatur di .env. Melewati operasi swap.");
        return null;
    }
    
    try {
        // Instansiasi kontrak token
        const tokenContract = new ethers.Contract(tokenInAddress, ERC20_ABI, senderWallet);
        
        // Dapatkan decimal token dan symbol
        const decimals = await tokenContract.decimals();
        const symbol = await tokenContract.symbol();
        const tokenAmount = ethers.utils.parseUnits(amountIn.toFixed(5), decimals);
        
        // Dapatkan symbol token tujuan untuk logging
        const tokenOutContract = new ethers.Contract(tokenOutAddress, ERC20_ABI, provider);
        const symbolOut = await tokenOutContract.symbol();
        
        console.log(`Wallet ${senderWallet.address}: Approving ${SWAP_ROUTER} to spend ${amountIn} ${symbol}...`);
        
        // Approve router untuk menggunakan token dengan jumlah lebih besar
        const approveTx = await tokenContract.approve(SWAP_ROUTER, tokenAmount.mul(20).div(10)); // 2x token amount
        console.log(`Wallet ${senderWallet.address}: Approve tx sent: ${approveTx.hash}`);
        await approveTx.wait(); // Tunggu approve selesai
        
        // Deadline sedikit lebih lama - 15 menit dari sekarang
        const deadline = Math.floor(Date.now() / 1000) + 900;
        
        // Tingkatkan slippage tolerance untuk ETH ke BTC swap
        const slippageTolerance = tokenInAddress === TOKEN_ADDRESSES.ETH && tokenOutAddress === TOKEN_ADDRESSES.BTC ? 0.08 : 0.01; // 8% untuk ETH-BTC, 1% untuk lainnya
        const amountOutMin = tokenAmount.mul(ethers.BigNumber.from(1000 - Math.floor(slippageTolerance * 1000)))
                              .div(ethers.BigNumber.from(1000));
        
        // Flags value yang konsisten dengan transaksi berhasil
        const flags = 100; // 0x64
        
        // Gunakan method ID yang sesuai berdasarkan jenis swap
        let methodId;
        
        if (tokenInAddress === TOKEN_ADDRESSES.ETH && tokenOutAddress === TOKEN_ADDRESSES.BTC) {
            methodId = "0xdb3e2198"; // Method khusus untuk ETH ke BTC
            console.log(`Wallet ${senderWallet.address}: Using special method ID ${methodId} for ETH to BTC swap`);
        } else {
            methodId = "0x414bf389"; // Method standar untuk swap lainnya
            console.log(`Wallet ${senderWallet.address}: Using standard method ID ${methodId} for swap`);
        }
        
        console.log(`Wallet ${senderWallet.address}: Swapping ${amountIn} ${symbol} to ${symbolOut} menggunakan method ID ${methodId}...`);
        
        // Log semua parameter untuk debugging
        console.log("Token In:", tokenInAddress);
        console.log("Token Out:", tokenOutAddress);
        console.log("Flags:", flags);
        console.log("Recipient:", senderWallet.address);
        console.log("Deadline:", deadline);
        console.log("Amount In:", tokenAmount.toString());
        console.log("Min Amount Out:", amountOutMin.toString());
        
        // Encode parameters sesuai dengan format yang berhasil
        const params = [
            tokenInAddress,
            tokenOutAddress,
            flags,
            senderWallet.address, // recipient
            deadline,
            tokenAmount,
            amountOutMin,
            0  // Parameter tambahan (v) yang konsisten dengan transaksi berhasil
        ];
        
        // Encode parameter types sesuai dengan fungsi yang berhasil
        const types = [
            'address', 'address', 'uint256', 'address', 'uint256', 'uint256', 'uint256', 'uint8'
        ];
        
        const encodedData = ethers.utils.defaultAbiCoder.encode(types, params);
        const data = methodId + encodedData.substring(2); // Remove '0x' prefix from encodedData
        
        // Tunggu sejenak setelah approve untuk memastikan approval dicatat di blockchain
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Gunakan gas limit yang lebih tinggi untuk ETH ke BTC swap
        const gasLimit = tokenInAddress === TOKEN_ADDRESSES.ETH && tokenOutAddress === TOKEN_ADDRESSES.BTC ? 
                          GAS_LIMIT * 5 : GAS_LIMIT * 3;
        
        console.log(`Gas limit set to: ${gasLimit}`);
        
        // Cek nonce terbaru untuk menghindari "nonce too low" errors
        const nonce = await provider.getTransactionCount(senderWallet.address);
        console.log(`Using nonce: ${nonce}`);
        
        // Kirim transaksi dengan parameter yang lebih ketat
        const swapTx = await senderWallet.sendTransaction({
            to: SWAP_ROUTER,
            data: data,
            gasLimit: gasLimit,
            gasPrice: GAS_PRICE,
            nonce: nonce
        });
        
        console.log(`Wallet ${senderWallet.address}: Swap transaction sent: ${swapTx.hash}`);
        log(`Wallet ${senderWallet.address}: Swap ${symbol} to ${symbolOut} transaction sent: ${swapTx.hash}`, './oglabs_swap.log');
        
        // Tunggu konfirmasi transaksi dengan timeout
        console.log(`Menunggu konfirmasi transaksi swap...`);
        
        // Tambahkan timeout untuk konfirmasi transaksi
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Transaction confirmation timeout")), 120000); // 2 menit timeout
        });
        
        // Tunggu konfirmasi atau timeout
        const receipt = await Promise.race([
            swapTx.wait(1),
            timeoutPromise
        ]);
        
        console.log(`Swap transaction confirmed! Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);
        
        if (receipt.status === 0) {
            console.error(`Swap transaction failed on-chain. Transaction hash: ${swapTx.hash}`);
            throw new Error("Transaction failed during execution");
        }
        
        return swapTx;
    } catch (error) {
        console.error(`Wallet ${senderWallet.address}: Error saat swap ${tokenInAddress} ke ${tokenOutAddress}: ${error.message}`);
        
        // Coba dapatkan status transaksi jika ada hash transaksi
        if (error.transaction && error.transaction.hash) {
            try {
                const txHash = error.transaction.hash;
                console.log(`Checking transaction status for hash: ${txHash}`);
                const tx = await provider.getTransaction(txHash);
                if (tx) {
                    console.log(`Transaction found. Nonce: ${tx.nonce}, Gas price: ${tx.gasPrice.toString()}`);
                    
                    // Coba dapatkan receipt jika transaksi sudah di-mine
                    const receipt = await provider.getTransactionReceipt(txHash);
                    if (receipt) {
                        console.log(`Transaction receipt retrieved. Status: ${receipt.status}, Gas used: ${receipt.gasUsed.toString()}`);
                        
                        // Check for reverted transaction
                        if (receipt.status === 0) {
                            console.log(`Transaction reverted on-chain. This usually means the smart contract rejected the transaction.`);
                            console.log(`Potential reasons: insufficient liquidity, price impact too high, or router constraints.`);
                        }
                    } else {
                        console.log(`Transaction is pending or not yet mined.`);
                    }
                } else {
                    console.log(`Transaction not found. It might have been dropped from the mempool.`);
                }
            } catch (txCheckError) {
                console.error(`Error checking transaction status: ${txCheckError.message}`);
            }
        }
        
        if (error.data) {
            console.error(`Error data: ${error.data}`);
        }
        
        log(`Wallet ${senderWallet.address}: Error saat swap ${tokenInAddress} ke ${tokenOutAddress}: ${error.message}`, './oglabs_error.log');
        return null;
    }
}

// Fungsi untuk pemilihan swap acak
function getRandomSwapMode() {
    const swapOptions = ["ETH_TO_USD", "BTC_TO_USD", "BTC_TO_ETH", "ETH_TO_BTC"];
    const randomIndex = Math.floor(Math.random() * swapOptions.length);
    return swapOptions[randomIndex];
}

// ===== FUNGSI OPERASI UTAMA =====
// Fungsi untuk melakukan operasi native transfer 1x per wallet
async function processNativeTransfer(wallet) {
    try {
        // Cek apakah wallet ini sudah melakukan transfer native
        if (processedWallets.has(wallet.address)) {
            console.log(`Wallet ${wallet.address} sudah melakukan transfer native sebelumnya, melewati.`);
            return;
        }
        
        // Cek balance native
        const nativeBalance = await getBalanceAddress(wallet.address);
        console.log(`Wallet ${wallet.address} Native Balance: ${nativeBalance}`);
        
        // Pastikan ada cukup balance untuk biaya gas + transfer
        const minRequired = parseFloat(MIN_BALANCE) + (GAS_PRICE * GAS_LIMIT) / 1e18;
        
        if (parseFloat(nativeBalance) >= minRequired) {
            // Pilih alamat tujuan random
            const randomAddress = getRandomAddress();
            
            // Tentukan jumlah transfer
            const amount = transferAmount();
            console.log(`Wallet ${wallet.address}: Amount native to transfer: ${amount}`);
            
            // Lakukan transfer native
            await transferNative(wallet, randomAddress, amount);
        } else {
            console.log(`Wallet ${wallet.address}: Insufficient native token balance for transfer`);
            // Tandai wallet ini sebagai sudah "diproses" meskipun tidak melakukan transfer
            processedWallets.add(wallet.address);
        }
    } catch (error) {
        console.error(`Error saat proses transfer native wallet ${wallet.address}: ${error.message}`);
        log(`Error saat proses transfer native wallet ${wallet.address}: ${error.message}`, './oglabs_error.log');
        
        // Tambahkan ke processed list meskipun error agar tidak dicoba lagi
        processedWallets.add(wallet.address);
    }
}

async function processAllSwapOperations(wallet) {
    try {
        // Cek apakah router swap sudah diatur
        if (!SWAP_ROUTER) {
            console.log("Swap router address tidak diatur di .env. Melewati operasi swap.");
            return;
        }
        
        // Cek balance token
        let usdBalance, ethBalance, btcBalance;
        
        try {
            usdBalance = await getTokenBalance(wallet.address, TOKEN_ADDRESSES.USD);
            console.log(`Wallet ${wallet.address} USD Balance: ${usdBalance.balance} ${usdBalance.symbol}`);
        } catch (error) {
            console.error(`Tidak bisa mendapatkan USD balance: ${error.message}`);
            usdBalance = { balance: "0", symbol: "USD", rawBalance: ethers.BigNumber.from(0) };
        }
        
        try {
            ethBalance = await getTokenBalance(wallet.address, TOKEN_ADDRESSES.ETH);
            console.log(`Wallet ${wallet.address} ETH Balance: ${ethBalance.balance} ${ethBalance.symbol}`);
        } catch (error) {
            console.error(`Tidak bisa mendapatkan ETH balance: ${error.message}`);
            ethBalance = { balance: "0", symbol: "ETH", rawBalance: ethers.BigNumber.from(0) };
        }
        
        try {
            btcBalance = await getTokenBalance(wallet.address, TOKEN_ADDRESSES.BTC);
            console.log(`Wallet ${wallet.address} BTC Balance: ${btcBalance.balance} ${btcBalance.symbol}`);
        } catch (error) {
            console.error(`Tidak bisa mendapatkan BTC balance: ${error.message}`);
            btcBalance = { balance: "0", symbol: "BTC", rawBalance: ethers.BigNumber.from(0) };
        }
        
        // Tentukan mode swap
        let currentSwapMode = SWAP_MODE;
        if (SWAP_MODE === "RANDOM") {
            currentSwapMode = getRandomSwapMode();
        }
        
        // Jika mode ALL, lakukan semua 4 jenis swap
        if (currentSwapMode === "ALL") {
            // Lakukan setiap swap dalam try-catch terpisah agar kegagalan satu tidak menghentikan yang lain
            
            // 1. ETH_TO_USD
            if (parseFloat(ethBalance.balance) > 0) {
                const swapAmount = parseFloat(ethBalance.balance) * (SWAP_PERCENT / 100);
                if (swapAmount > 0) {
                    console.log(`Wallet ${wallet.address}: Mencoba swap ${swapAmount} ETH to USD (${SWAP_PERCENT}% dari balance)`);
                    try {
                        await swapTokenToToken(
                            wallet, 
                            TOKEN_ADDRESSES.ETH, 
                            TOKEN_ADDRESSES.USD, 
                            swapAmount
                        );
                    } catch (err) {
                        console.error(`ETH_TO_USD swap error: ${err.message}`);
                    }
                    // Tunggu sedikit untuk menghindari nonce issues
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    console.log(`Wallet ${wallet.address}: ETH balance too low for swap`);
                }
            } else {
                console.log(`Wallet ${wallet.address}: No ETH balance for ETH_TO_USD swap`);
            }
                
            // 2. BTC_TO_USD
            if (parseFloat(btcBalance.balance) > 0) {
                const swapAmount = parseFloat(btcBalance.balance) * (SWAP_PERCENT / 100);
                if (swapAmount > 0) {
                    console.log(`Wallet ${wallet.address}: Mencoba swap ${swapAmount} BTC to USD (${SWAP_PERCENT}% dari balance)`);
                    try {
                        await swapTokenToToken(
                            wallet, 
                            TOKEN_ADDRESSES.BTC, 
                            TOKEN_ADDRESSES.USD, 
                            swapAmount
                        );
                    } catch (err) {
                        console.error(`BTC_TO_USD swap error: ${err.message}`);
                    }
                    // Tunggu sedikit untuk menghindari nonce issues
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    console.log(`Wallet ${wallet.address}: BTC balance too low for swap`);
                }
            } else {
                console.log(`Wallet ${wallet.address}: No BTC balance for BTC_TO_USD swap`);
            }
                
            // 3. BTC_TO_ETH
            if (parseFloat(btcBalance.balance) > 0) {
                const swapAmount = parseFloat(btcBalance.balance) * (SWAP_PERCENT / 100);
                if (swapAmount > 0) {
                    console.log(`Wallet ${wallet.address}: Mencoba swap ${swapAmount} BTC to ETH (${SWAP_PERCENT}% dari balance)`);
                    try {
                        await swapTokenToToken(
                            wallet, 
                            TOKEN_ADDRESSES.BTC, 
                            TOKEN_ADDRESSES.ETH, 
                            swapAmount
                        );
                    } catch (err) {
                        console.error(`USD_TO_ETH swap error: ${err.message}`);
                    }
                    // Tunggu sedikit untuk menghindari nonce issues
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    console.log(`Wallet ${wallet.address}: USD balance too low for swap`);
                }
            } else {
                console.log(`Wallet ${wallet.address}: No USD balance for USD_TO_ETH swap`);
            }
                
            // 4. USD_TO_BTC
            if (parseFloat(ethBalance.balance) > 0) {
                const swapAmount = parseFloat(ethBalance.balance) * (SWAP_PERCENT / 100);
                if (swapAmount > 0) {
                    console.log(`Wallet ${wallet.address}: Mencoba swap ${swapAmount} ETH to BTC (${SWAP_PERCENT}% dari balance)`);
                    try {
                        await swapTokenToToken(
                            wallet, 
                            TOKEN_ADDRESSES.ETH, 
                            TOKEN_ADDRESSES.BTC, 
                            swapAmount
                        );
                    } catch (err) {
                        console.error(`ETH_TO_BTC swap error: ${err.message}`);
                    }
                } else {
                    console.log(`Wallet ${wallet.address}: USD balance too low for swap`);
                }
            } else {
                console.log(`Wallet ${wallet.address}: No USD balance for USD_TO_BTC swap`);
            }
        } else {
            // Untuk mode single swap, tetap gunakan persentase dari balance dan wrap dalam try-catch
            
            try {
                switch (currentSwapMode) {
                    case "ETH_TO_USD":
                        if (parseFloat(ethBalance.balance) > 0) {
                            const swapAmount = parseFloat(ethBalance.balance) * (SWAP_PERCENT / 100);
                            console.log(`Wallet ${wallet.address}: Swapping ${swapAmount} ETH to USD (${SWAP_PERCENT}% dari balance)`);
                            await swapTokenToToken(
                                wallet, 
                                TOKEN_ADDRESSES.ETH, 
                                TOKEN_ADDRESSES.USD, 
                                swapAmount
                            );
                        } else {
                            console.log(`Wallet ${wallet.address}: Insufficient ETH balance for swap`);
                        }
                        break;
                    
                    case "BTC_TO_USD":
                        if (parseFloat(btcBalance.balance) > 0) {
                            const swapAmount = parseFloat(btcBalance.balance) * (SWAP_PERCENT / 100);
                            console.log(`Wallet ${wallet.address}: Swapping ${swapAmount} BTC to USD (${SWAP_PERCENT}% dari balance)`);
                            await swapTokenToToken(
                                wallet, 
                                TOKEN_ADDRESSES.BTC, 
                                TOKEN_ADDRESSES.USD, 
                                swapAmount
                            );
                        } else {
                            console.log(`Wallet ${wallet.address}: Insufficient BTC balance for swap`);
                        }
                        break;
                    
                    case "BTC_TO_ETH":
                        if (parseFloat(btcBalance.balance) > 0) {
                            const swapAmount = parseFloat(btcBalance.balance) * (SWAP_PERCENT / 100);
                            console.log(`Wallet ${wallet.address}: Swapping ${swapAmount} BTC to ETH (${SWAP_PERCENT}% dari balance)`);
                            await swapTokenToToken(
                                wallet, 
                                TOKEN_ADDRESSES.BTC, 
                                TOKEN_ADDRESSES.ETH, 
                                swapAmount
                            );
                        } else {
                            console.log(`Wallet ${wallet.address}: Insufficient USD balance for swap`);
                        }
                        break;
                    
                    case "ETH_TO_BTC":
                        if (parseFloat(ethBalance.balance) > 0) {
                            const swapAmount = parseFloat(ethBalance.balance) * (SWAP_PERCENT / 100);
                            console.log(`Wallet ${wallet.address}: Swapping ${swapAmount} ETH to BTC (${SWAP_PERCENT}% dari balance)`);
                            await swapTokenToToken(
                                wallet, 
                                TOKEN_ADDRESSES.ETH, 
                                TOKEN_ADDRESSES.BTC, 
                                swapAmount
                            );
                        } else {
                            console.log(`Wallet ${wallet.address}: Insufficient USD balance for swap`);
                        }
                        break;
                        
                    default:
                        console.log(`Wallet ${wallet.address}: Skipping swap - unknown mode: ${currentSwapMode}`);
                }
            } catch (error) {
                console.error(`Error saat single swap mode ${currentSwapMode}: ${error.message}`);
                log(`Error saat single swap mode ${currentSwapMode}: ${error.message}`, './oglabs_error.log');
            }
        }
    } catch (error) {
        console.error(`Error saat proses swap wallet ${wallet.address}: ${error.message}`);
        log(`Error saat proses swap wallet ${wallet.address}: ${error.message}`, './oglabs_error.log');
    }
}

// ===== FUNGSI UTAMA =====
// Fungsi utama untuk mengatur operasi
async function mainOperation() {
    try {
        // Setup daftar wallet
        const wallets = await walletSetup();
        
        // Pertama, pastikan semua wallet telah melakukan satu kali transfer native
        console.log("===== FASE TRANSFER NATIVE SATU KALI =====");
        for (const wallet of wallets) {
            if (!processedWallets.has(wallet.address)) {
                await processNativeTransfer(wallet);
                // Tunggu sedikit untuk menghindari nonce issues
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        console.log("===== SEMUA WALLET SUDAH DIPROSES UNTUK TRANSFER NATIVE =====");
        
        // Selanjutnya mulai fase swap terus menerus
        console.log("===== MEMULAI FASE SWAP =====");
        await swapLoop(wallets);
        
    } catch (error) {
        console.error("Error in main operation:", error);
        log(`Error in main operation: ${error.message}`, './oglabs_error.log');
        console.log(`Restarting in ${DURATION/1000} seconds...`);
        setTimeout(mainOperation, DURATION);
    }
}

// Fungsi untuk loop swap terus menerus
async function swapLoop(wallets) {
    try {
        // Rotate through all wallets and perform swaps
        for (const wallet of wallets) {
            await processAllSwapOperations(wallet);
            // Tunggu sedikit untuk menghindari nonce issues
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        console.log(`Completed swap cycle for all wallets. Waiting ${DURATION/1000} seconds for next cycle...`);
        // Schedule next cycle
        setTimeout(() => swapLoop(wallets), DURATION);
    } catch (error) {
        console.error("Error in swap loop:", error);
        log(`Error in swap loop: ${error.message}`, './oglabs_error.log');
        console.log(`Retrying swap cycle in ${DURATION/1000} seconds...`);
        setTimeout(() => swapLoop(wallets), DURATION);
    }
}

// ===== MULAI SKRIP =====
// Mulai proses
console.log("Starting 0G Labs Auto Transfer and Swap...");
log("Starting 0G Labs Auto Transfer and Swap...", './oglabs.log');
mainOperation();
