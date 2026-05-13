pragma solidity ^0.5.0;

contract TaskCommitment {
  uint public taskCount = 0;

  enum Status { Pending, Completed, Failed }

  struct Task {
    uint id;
    address payable owner;
    string content;
    uint stake;
    uint deadline;
    address payable penaltyAddress;
    Status status;
  }

  mapping(uint => Task) public tasks;

  event TaskCreated(
    uint id,
    address owner,
    string content,
    uint stake,
    uint deadline,
    address penaltyAddress
  );

  event TaskCompleted(uint id, address owner, uint stake);
  event TaskFailed(uint id, address penaltyAddress, uint stake);

  function createTask(
    string memory _content,
    uint _deadline,
    address payable _penaltyAddress
  ) public payable {
    require(msg.value > 0, "Must stake ETH");
    require(_deadline > now, "Deadline must be in the future");
    require(_penaltyAddress != address(0), "Penalty address required");
    require(_penaltyAddress != msg.sender, "Penalty address cannot be the owner");

    taskCount++;
    tasks[taskCount] = Task(
      taskCount,
      msg.sender,
      _content,
      msg.value,
      _deadline,
      _penaltyAddress,
      Status.Pending
    );

    emit TaskCreated(
      taskCount,
      msg.sender,
      _content,
      msg.value,
      _deadline,
      _penaltyAddress
    );
  }

  function verifyCompletion(uint _id) public {
    Task storage task = tasks[_id];
    require(task.id != 0, "Task does not exist");
    require(task.status == Status.Pending, "Task already resolved");
    require(msg.sender == task.owner, "Only owner can mark complete");
    require(now <= task.deadline, "Deadline has passed");

    task.status = Status.Completed;
    uint payout = task.stake;
    task.owner.transfer(payout);

    emit TaskCompleted(_id, task.owner, payout);
  }

  function claimPenalty(uint _id) public {
    Task storage task = tasks[_id];
    require(task.id != 0, "Task does not exist");
    require(task.status == Status.Pending, "Task already resolved");
    require(now > task.deadline, "Deadline has not passed yet");

    task.status = Status.Failed;
    uint payout = task.stake;
    task.penaltyAddress.transfer(payout);

    emit TaskFailed(_id, task.penaltyAddress, payout);
  }
}
