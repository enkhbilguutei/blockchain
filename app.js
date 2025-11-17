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

// CSV Import for Products
async function importProductsFromCSV() {
    const fileInput = document.getElementById('csvFile');
    if (!fileInput.files.length) {
        return showStatus('importStatus', 'Please select a CSV file!', true);
    }

    if (!contract) {
        return showStatus('importStatus', 'Contract not initialized. Please configure it first.', true);
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            showStatus('importStatus', 'Processing CSV file...', false);
            const csv = e.target.result;
            const lines = csv.trim().split('\n');

            if (lines.length < 2) {
                return showStatus('importStatus', 'CSV file must have a header row and at least one product!', true);
            }

            // Detect delimiter (tab or comma)
            const firstLine = lines[0];
            const delimiter = firstLine.includes('\t') ? '\t' : ',';

            // Parse header
            const header = firstLine.split(delimiter).map(h => h.trim().toLowerCase());
            const nameIndex = header.findIndex(h => h.includes('product name') || h === 'product name');
            const quantityIndex = header.findIndex(h => h.includes('quantity') || h === 'quantity');
            const priceIndex = header.findIndex(h => h.includes('price') || h === 'price per unit' || h === 'price');

            if (nameIndex === -1 || quantityIndex === -1 || priceIndex === -1) {
                return showStatus('importStatus', 'CSV must have columns: Product Name, Quantity, Price per Unit', true);
            }

            // Parse products
            const products = [];
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                const fields = line.split(delimiter).map(f => f.trim());
                
                // Validate we have enough fields
                if (fields.length <= Math.max(nameIndex, quantityIndex, priceIndex)) {
                    continue; // Skip malformed rows
                }

                const name = fields[nameIndex];
                const quantity = parseInt(fields[quantityIndex], 10);
                const price = parseInt(fields[priceIndex], 10);

                if (!name || isNaN(quantity) || isNaN(price) || quantity <= 0 || price <= 0) {
                    console.warn(`Row ${i + 1}: Skipping - Invalid data (Name: "${name}", Qty: ${quantity}, Price: ${price})`);
                    continue; // Skip invalid rows instead of failing
                }

                products.push({ name, quantity, price });
            }

            if (products.length === 0) {
                return showStatus('importStatus', 'No valid products found in CSV. Please check the format.', true);
            }

            // Show preview
            showImportPreview(products);
        } catch (error) {
            showStatus('importStatus', 'Error parsing CSV: ' + error.message, true);
        }
    };

    reader.readAsText(file);
}

function showImportPreview(products) {
    const previewDiv = document.getElementById('importPreview');
    const html = `
        <div style="border: 1px solid #000; padding: 15px; background-color: #f5f5f5;">
            <h3 style="margin-bottom: 10px; font-size: 14px;">Preview: ${products.length} products to import</h3>
            <div style="max-height: 300px; overflow-y: auto; margin-bottom: 15px;">
                ${products.map((p, idx) => `
                    <div style="padding: 8px; border-bottom: 1px solid #ddd; background-color: #fff; margin-bottom: 5px;">
                        <strong>${idx + 1}.</strong> ${p.name} | Qty: ${p.quantity} | Price: ${p.price}
                    </div>
                `).join('')}
            </div>
            <button onclick="confirmImportProducts()" style="background-color: #27ae60; margin-right: 10px;">Confirm Import</button>
            <button onclick="cancelImport()" style="background-color: #e74c3c;">Cancel</button>
        </div>
    `;
    previewDiv.innerHTML = html;
}

async function confirmImportProducts() {
    const fileInput = document.getElementById('csvFile');
    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const csv = e.target.result;
            const lines = csv.trim().split('\n');
            
            // Detect delimiter
            const firstLine = lines[0];
            const delimiter = firstLine.includes('\t') ? '\t' : ',';

            const header = firstLine.split(delimiter).map(h => h.trim().toLowerCase());
            const nameIndex = header.findIndex(h => h.includes('product name') || h === 'product name');
            const quantityIndex = header.findIndex(h => h.includes('quantity') || h === 'quantity');
            const priceIndex = header.findIndex(h => h.includes('price') || h === 'price per unit' || h === 'price');

            const products = [];
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                const fields = line.split(delimiter).map(f => f.trim());
                
                if (fields.length <= Math.max(nameIndex, quantityIndex, priceIndex)) {
                    continue;
                }

                const name = fields[nameIndex];
                const quantity = parseInt(fields[quantityIndex], 10);
                const price = parseInt(fields[priceIndex], 10);

                if (name && !isNaN(quantity) && !isNaN(price) && quantity > 0 && price > 0) {
                    products.push({ name, quantity, price });
                }
            }

            showStatus('importStatus', 'Importing products... This may take a moment.', false);
            let successCount = 0;
            let errorCount = 0;

            for (const product of products) {
                try {
                    await contract.methods.addProduct(product.name, product.quantity, product.price).send({ from: account });
                    successCount++;
                } catch (error) {
                    console.error(`Error importing ${product.name}:`, error);
                    errorCount++;
                }
                // Small delay between transactions
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            showStatus('importStatus', `Import complete! ${successCount} products added, ${errorCount} failed.`, errorCount > 0);
            document.getElementById('importPreview').innerHTML = '';
            fileInput.value = '';
            
            // Refresh contract data
            setTimeout(fetchHistoryFromContract, 2000);
        } catch (error) {
            showStatus('importStatus', 'Error during import: ' + error.message, true);
        }
    };

    reader.readAsText(file);
}

function cancelImport() {
    document.getElementById('csvFile').value = '';
    document.getElementById('importPreview').innerHTML = '';
    showStatus('importStatus', 'Import cancelled.', false);
}

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

async function populateProductDropdown() {
    try {
        if (!contract) {
            return showStatus('updateStatus', 'Contract not initialized. Please configure it first.', true);
        }

        showStatus('updateStatus', 'Loading products...', false);
        const count = await contract.methods.getTotalProducts().call();
        const selectElement = document.getElementById('updateProductSelect');
        
        // Clear existing options except the first one
        selectElement.innerHTML = '<option value="">-- Select a Product --</option>';
        
        for (let i = 1; i <= count; i++) {
            try {
                const product = await contract.methods.getProduct(i).call();
                if (product[4]) { // Check if product exists
                    const option = document.createElement('option');
                    option.value = i;
                    option.textContent = `ID: ${i} - ${product[1]} (Qty: ${product[2]}, Price: ${product[3]})`;
                    selectElement.appendChild(option);
                }
            } catch (error) {
                // Skip deleted products
            }
        }
        
        showStatus('updateStatus', 'Products loaded successfully!', false);
    } catch (error) {
        showStatus('updateStatus', 'Error loading products: ' + error.message, true);
    }
}

async function loadProductForUpdate() {
    const productId = document.getElementById('updateProductSelect').value;
    
    if (!productId) {
        clearFields('updateId', 'updateName', 'updateQuantity', 'updatePrice');
        return;
    }

    try {
        const product = await contract.methods.getProduct(productId).call();
        
        // Prefill the form fields
        document.getElementById('updateId').value = product[0];
        document.getElementById('updateName').value = product[1];
        document.getElementById('updateQuantity').value = product[2];
        document.getElementById('updatePrice').value = product[3];
        
        showStatus('updateStatus', 'Product loaded! You can now edit the fields.', false);
    } catch (error) {
        showStatus('updateStatus', 'Error loading product: ' + error.message, true);
        clearFields('updateId', 'updateName', 'updateQuantity', 'updatePrice');
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
        document.getElementById('updateProductSelect').value = '';
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

// CSV Export Functions
function downloadCSV(csv, filename) {
    const BOM = '\uFEFF'; // UTF-8 BOM for proper character encoding
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function escapeCSV(field) {
    if (field === null || field === undefined) return '';
    const stringField = field.toString();
    if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
        return '"' + stringField.replace(/"/g, '""') + '"';
    }
    return stringField;
}

async function exportProductsToCSV() {
    try {
        showStatus('exportStatus', 'Preparing products export...', false);
        const count = await contract.methods.getTotalProducts().call();
        const products = [];

        for (let i = 1; i <= count; i++) {
            try {
                const product = await contract.methods.getProduct(i).call();
                if (product[4]) { // Only include active products
                    products.push({
                        id: product[0],
                        name: product[1],
                        quantity: product[2],
                        price: product[3],
                        totalValue: parseInt(product[2], 10) * parseInt(product[3], 10)
                    });
                }
            } catch (error) {
                // Ignore deleted products
            }
        }

        let csv = 'Product ID,Product Name,Quantity,Price per Unit,Total Stock Value\n';
        csv += products.map(p => 
            `${escapeCSV(p.id)},${escapeCSV(p.name)},${escapeCSV(p.quantity)},${escapeCSV(p.price)},${escapeCSV(p.totalValue)}`
        ).join('\n');

        const timestamp = new Date().toISOString().split('T')[0];
        downloadCSV(csv, `inventory_products_${timestamp}.csv`);
        showStatus('exportStatus', `Exported ${products.length} products to CSV!`, false);
    } catch (error) {
        showStatus('exportStatus', 'Error exporting products: ' + error.message, true);
    }
}

async function exportTransactionHistoryToCSV() {
    try {
        showStatus('exportStatus', 'Preparing transaction history export...', false);
        
        if (transactionHistory.length === 0) {
            return showStatus('exportStatus', 'No transactions to export!', true);
        }

        let csv = 'Transaction Type,Product ID,Product Name,Quantity,Price per Unit,Total Stock Value,Timestamp,Transaction Hash,Block Number\n';
        csv += transactionHistory.map(entry => 
            `${escapeCSV(entry.type)},${escapeCSV(entry.productId)},${escapeCSV(entry.productName)},${escapeCSV(entry.quantity)},${escapeCSV(entry.price)},${escapeCSV(entry.totalValue)},${escapeCSV(entry.timestamp)},${escapeCSV(entry.transactionHash)},${escapeCSV(entry.blockNumber)}`
        ).join('\n');

        const timestamp = new Date().toISOString().split('T')[0];
        downloadCSV(csv, `inventory_history_${timestamp}.csv`);
        showStatus('exportStatus', `Exported ${transactionHistory.length} transactions to CSV!`, false);
    } catch (error) {
        showStatus('exportStatus', 'Error exporting history: ' + error.message, true);
    }
}

async function exportAllDataToCSV() {
    try {
        showStatus('exportStatus', 'Preparing complete data export...', false);
        
        // Export products
        const count = await contract.methods.getTotalProducts().call();
        const products = [];

        for (let i = 1; i <= count; i++) {
            try {
                const product = await contract.methods.getProduct(i).call();
                if (product[4]) {
                    products.push({
                        id: product[0],
                        name: product[1],
                        quantity: product[2],
                        price: product[3],
                        totalValue: parseInt(product[2], 10) * parseInt(product[3], 10)
                    });
                }
            } catch (error) {
                // Ignore deleted products
            }
        }

        // Products CSV
        let productsCsv = 'Product ID,Product Name,Quantity,Price per Unit,Total Stock Value\n';
        productsCsv += products.map(p => 
            `${escapeCSV(p.id)},${escapeCSV(p.name)},${escapeCSV(p.quantity)},${escapeCSV(p.price)},${escapeCSV(p.totalValue)}`
        ).join('\n');

        // Transaction History CSV
        let historyCsv = 'Transaction Type,Product ID,Product Name,Quantity,Price per Unit,Total Stock Value,Timestamp,Transaction Hash,Block Number\n';
        if (transactionHistory.length > 0) {
            historyCsv += transactionHistory.map(entry => 
                `${escapeCSV(entry.type)},${escapeCSV(entry.productId)},${escapeCSV(entry.productName)},${escapeCSV(entry.quantity)},${escapeCSV(entry.price)},${escapeCSV(entry.totalValue)},${escapeCSV(entry.timestamp)},${escapeCSV(entry.transactionHash)},${escapeCSV(entry.blockNumber)}`
            ).join('\n');
        }

        // Summary Stats CSV
        let currentStockValue = 0;
        for (let product of products) {
            currentStockValue += product.totalValue;
        }

        const now = new Date().toLocaleString();
        let summaryCSV = 'Inventory Management Export Summary\n';
        summaryCSV += `Export Date,${escapeCSV(now)}\n`;
        summaryCSV += `Total Products,${products.length}\n`;
        summaryCSV += `Total Transactions,${transactionHistory.length}\n`;
        summaryCSV += `Current Stock Value,${currentStockValue.toLocaleString()}\n`;
        summaryCSV += '\n--- PRODUCTS ---\n' + productsCsv;
        summaryCSV += '\n\n--- TRANSACTION HISTORY ---\n' + historyCsv;

        const timestamp = new Date().toISOString().split('T')[0];
        downloadCSV(summaryCSV, `inventory_complete_${timestamp}.csv`);
        showStatus('exportStatus', `Exported all data (${products.length} products, ${transactionHistory.length} transactions) to CSV!`, false);
    } catch (error) {
        showStatus('exportStatus', 'Error exporting data: ' + error.message, true);
    }
}
