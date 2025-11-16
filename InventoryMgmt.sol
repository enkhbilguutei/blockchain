// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract InventoryManagement {
    
    // Struct to store product details
    struct Product {
        uint id;
        string name;
        uint quantity;
        uint price;
        bool exists;
    }
    
    // Mapping to store products (productId => Product)
    mapping(uint => Product) public products;
    
    // Counter for product IDs
    uint public productCount;
    
    // Owner of the contract
    address public owner;
    
    // Events for tracking operations
    event ProductAdded(uint id, string name, uint quantity, uint price);
    event ProductUpdated(uint id, string name, uint quantity, uint price);
    event ProductDeleted(uint id);
    
    // Constructor
    constructor() {
        owner = msg.sender;
        productCount = 0;
    }
    
    // Modifier to check if caller is owner
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can perform this action");
        _;
    }
    
    // CREATE: Add a new product
    function addProduct(string memory _name, uint _quantity, uint _price) public onlyOwner {
        productCount++;
        products[productCount] = Product(productCount, _name, _quantity, _price, true);
        emit ProductAdded(productCount, _name, _quantity, _price);
    }
    
    // READ: Get product details
    function getProduct(uint _id) public view returns (uint, string memory, uint, uint, bool) {
        require(products[_id].exists, "Product does not exist");
        Product memory p = products[_id];
        return (p.id, p.name, p.quantity, p.price, p.exists);
    }
    
    // UPDATE: Update product details
    function updateProduct(uint _id, string memory _name, uint _quantity, uint _price) public onlyOwner {
        require(products[_id].exists, "Product does not exist");
        products[_id].name = _name;
        products[_id].quantity = _quantity;
        products[_id].price = _price;
        emit ProductUpdated(_id, _name, _quantity, _price);
    }
    
    // DELETE: Delete a product
    function deleteProduct(uint _id) public onlyOwner {
        require(products[_id].exists, "Product does not exist");
        products[_id].exists = false;
        emit ProductDeleted(_id);
    }
    
    // Get total number of products
    function getTotalProducts() public view returns (uint) {
        return productCount;
    }
}
