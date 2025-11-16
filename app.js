let web3, contract, account;
let transactionHistory = [];

// Restore saved contract address when the UI loads
window.addEventListener('DOMContentLoaded', () => {
    const savedAddress = localStorage.getItem('contractAddress');
    if (savedAddress) document.getElementById('contractAddress').value = savedAddress;
});

async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
        return showStatus('configStatus', 'Please install MetaMask!', true);
    }

    try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        account = accounts[0];
        web3 = new Web3(window.ethereum);
        const accountEl = document.getElementById('account');
        accountEl.innerHTML = `Connected: ${account.substring(0, 6)}...${account.substring(38)}`;
        accountEl.style.display = 'block';
        showStatus('configStatus', 'Wallet connected successfully!', false);
    } catch (error) {
        showStatus('configStatus', 'Failed to connect wallet: ' + error.message, true);
    }
}

function initContract() {
    const address = document.getElementById('contractAddress').value;
    if (!address) return showStatus('configStatus', 'Please enter contract address!', true);
    if (!web3) return showStatus('configStatus', 'Please connect wallet first!', true);

    contract = new web3.eth.Contract(contractABI, address);
    localStorage.setItem('contractAddress', address);
    showStatus('configStatus', 'Contract initialized successfully!', false);
    fetchHistoryFromContract();
}

// Helper to get form values
const getValues = (...ids) => ids.map(id => document.getElementById(id).value);
const clearFields = (...ids) => ids.forEach(id => document.getElementById(id).value = '');

async function addProduct() {
    const [name, quantity, price] = getValues('addName', 'addQuantity', 'addPrice');
    if (!name || !quantity || !price) return showStatus('addStatus', 'Please fill all fields!', true);

    try {
        showStatus('addStatus', 'Adding product... Please wait.', false);
        await contract.methods.addProduct(name, quantity, price).send({ from: account });
        showStatus('addStatus', 'Product added successfully!', false);
        setTimeout(fetchHistoryFromContract, 2000);
        clearFields('addName', 'addQuantity', 'addPrice');
    } catch (error) {
        showStatus('addStatus', 'Error: ' + error.message, true);
    }
}

async function getProduct() {
    const [id] = getValues('readId');
    if (!id) return showStatus('readStatus', 'Please enter product ID!', true);

    try {
        const product = await contract.methods.getProduct(id).call();
        document.getElementById('productDetails').innerHTML = `
            <div class="product-item">
                <p><strong>ID:</strong> ${product[0]}</p>
                <p><strong>Name:</strong> ${product[1]}</p>
                <p><strong>Quantity:</strong> ${product[2]}</p>
                <p><strong>Price:</strong> ${product[3]}</p>
                <p><strong>Status:</strong> ${product[4] ? 'Active' : 'Deleted'}</p>
            </div>
        `;
        showStatus('readStatus', 'Product loaded successfully!', false);
    } catch (error) {
        showStatus('readStatus', 'Error: ' + error.message, true);
        document.getElementById('productDetails').innerHTML = '';
    }
}

async function updateProduct() {
    const [id, name, quantity, price] = getValues('updateId', 'updateName', 'updateQuantity', 'updatePrice');
    if (!id || !name || !quantity || !price) return showStatus('updateStatus', 'Please fill all fields!', true);

    try {
        showStatus('updateStatus', 'Updating product... Please wait.', false);
        await contract.methods.updateProduct(id, name, quantity, price).send({ from: account });
        showStatus('updateStatus', 'Product updated successfully!', false);
        setTimeout(fetchHistoryFromContract, 2000);
        clearFields('updateId', 'updateName', 'updateQuantity', 'updatePrice');
    } catch (error) {
        showStatus('updateStatus', 'Error: ' + error.message, true);
    }
}

async function deleteProduct() {
    const [id] = getValues('deleteId');
    if (!id) return showStatus('deleteStatus', 'Please enter product ID!', true);

    try {
        showStatus('deleteStatus', 'Deleting product... Please wait.', false);
        await contract.methods.deleteProduct(id).send({ from: account });
        showStatus('deleteStatus', 'Product deleted successfully!', false);
        setTimeout(fetchHistoryFromContract, 2000);
        clearFields('deleteId');
    } catch (error) {
        showStatus('deleteStatus', 'Error: ' + error.message, true);
    }
}

async function getAllProducts() {
    try {
        showStatus('allProductsStatus', 'Loading products...', false);
        const count = await contract.methods.getTotalProducts().call();
        const products = [];

        for (let i = 1; i <= count; i++) {
            try {
                const product = await contract.methods.getProduct(i).call();
                if (product[4]) products.push(product);
            } catch (error) {
                // Ignore deleted products
            }
        }

        const html = products.map(p => `
            <div class="product-item">
                <p><strong>ID:</strong> ${p[0]}</p>
                <p><strong>Name:</strong> ${p[1]}</p>
                <p><strong>Quantity:</strong> ${p[2]}</p>
                <p><strong>Price:</strong> ${p[3]}</p>
            </div>
        `).join('') || '<p>No products found.</p>';

        document.getElementById('allProductsList').innerHTML = html;
        showStatus('allProductsStatus', `Loaded ${products.length} products successfully!`, false);
    } catch (error) {
        showStatus('allProductsStatus', 'Error: ' + error.message, true);
    }
}

function showStatus(elementId, message, isError) {
    const statusElement = document.getElementById(elementId);
    statusElement.textContent = message;
    statusElement.className = isError ? 'status error' : 'status';
    statusElement.style.display = 'block';
    setTimeout(() => statusElement.style.display = 'none', 5000);
}

async function fetchHistoryFromContract() {
    try {
        if (!contract) return showStatus('historyList', 'Contract not initialized. Please configure it first.', true);

        const [addedEvents, updatedEvents, deletedEvents] = await Promise.all([
            contract.getPastEvents('ProductAdded', { fromBlock: 0, toBlock: 'latest' }),
            contract.getPastEvents('ProductUpdated', { fromBlock: 0, toBlock: 'latest' }),
            contract.getPastEvents('ProductDeleted', { fromBlock: 0, toBlock: 'latest' })
        ]);

        const parseEvent = (event, type) => ({
            type,
            productId: event.returnValues.id,
            productName: event.returnValues.name,
            quantity: parseInt(event.returnValues.quantity || 0, 10),
            price: parseInt(event.returnValues.price || 0, 10),
            get totalValue() { return this.quantity * this.price; },
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash
        });

        const historyEvents = [
            ...addedEvents.map(e => parseEvent(e, 'add')),
            ...updatedEvents.map(e => parseEvent(e, 'update')),
            ...deletedEvents.map(e => parseEvent(e, 'delete'))
        ].sort((a, b) => b.blockNumber - a.blockNumber);

        transactionHistory = await Promise.all(
            historyEvents.map(async event => {
                try {
                    const block = await web3.eth.getBlock(event.blockNumber);
                    event.timestamp = new Date(block.timestamp * 1000).toLocaleString();
                } catch (error) {
                    event.timestamp = 'Unknown';
                }
                return event;
            })
        );

        updateHistoryDisplay();
        updateHistoryStats();
    } catch (error) {
        console.error('Error fetching history:', error);
        updateHistoryDisplay();
    }
}

function updateHistoryDisplay() {
    const historyList = document.getElementById('historyList');

    if (transactionHistory.length === 0) {
        historyList.innerHTML = '<p>No transactions yet. Add, update, or delete a product to see history.</p>';
        return;
    }

    const renderDetails = (entry) => {
        const details = {
            add: `
                <p><strong>Product Name:</strong> ${entry.productName}</p>
                <p><strong>Quantity:</strong> ${entry.quantity} units</p>
                <p><strong>Price per Unit:</strong> ${entry.price}</p>
                <p><strong>Total Stock Value:</strong> ${entry.totalValue}</p>
            `,
            delete: `
                <p><strong>Product ID:</strong> ${entry.productId}</p>
                <p><strong>Stock Value Removed:</strong> Unknown</p>
            `,
            update: `
                <p><strong>Product ID:</strong> ${entry.productId}</p>
                <p><strong>Product Name:</strong> ${entry.productName}</p>
                <p><strong>New Quantity:</strong> ${entry.quantity} units</p>
                <p><strong>New Price per Unit:</strong> ${entry.price}</p>
                <p><strong>New Stock Value:</strong> ${entry.totalValue}</p>
            `
        };
        return details[entry.type];
    };

    historyList.innerHTML = transactionHistory.map(entry => `
        <div class="history-item ${entry.type}">
            <div class="action-type">${entry.type.charAt(0).toUpperCase() + entry.type.slice(1)}</div>
            ${renderDetails(entry)}
            <p class="timestamp">⏱ ${entry.timestamp}</p>
            <p style="font-size: 11px; color: #999; margin-top: 8px;">
                <strong>Tx:</strong> ${entry.transactionHash.substring(0, 10)}...${entry.transactionHash.substring(58)} | 
                <strong>Block:</strong> ${entry.blockNumber}
            </p>
        </div>
    `).join('');
}

async function updateHistoryStats() {
    await calculateCurrentStockValue();
    document.getElementById('totalTransactions').textContent = transactionHistory.length;
}

async function calculateCurrentStockValue() {
    try {
        if (!contract) {
            document.getElementById('currentStockValue').textContent = '0';
            return;
        }

        const count = await contract.methods.getTotalProducts().call();
        let currentValue = 0;

        for (let i = 1; i <= count; i++) {
            try {
                const product = await contract.methods.getProduct(i).call();
                if (product[4]) currentValue += parseInt(product[2], 10) * parseInt(product[3], 10);
            } catch (error) {
                // Ignore missing rows
            }
        }

        document.getElementById('currentStockValue').textContent = currentValue.toLocaleString();
    } catch (error) {
        console.error('Error calculating current stock value:', error);
        document.getElementById('currentStockValue').textContent = '0';
    }
}

function clearHistory() {
    alert('History is stored on the blockchain. It cannot be cleared. This is immutable data.');
}
