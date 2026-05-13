var TaskCommitment = artifacts.require("./TaskCommitment.sol");

module.exports = function(deployer) {
  deployer.deploy(TaskCommitment);
};
