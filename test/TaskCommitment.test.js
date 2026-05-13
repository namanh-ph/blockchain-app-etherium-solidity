const TaskCommitment = artifacts.require('./TaskCommitment.sol');

const STATUS = { Pending: 0, Completed: 1, Failed: 2 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

contract('TaskCommitment', (accounts) => {
  const [owner, penalty, stranger] = accounts;
  let app;

  beforeEach(async () => {
    app = await TaskCommitment.new();
  });

  it('deploys successfully with zero tasks', async () => {
    assert.notEqual(app.address, 0x0);
    const count = await app.taskCount();
    assert.equal(count.toNumber(), 0);
  });

  it('creates a task and locks the staked ETH in the contract', async () => {
    const stake = web3.utils.toWei('0.01', 'ether');
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    const result = await app.createTask(
      'Finish portfolio site',
      deadline,
      penalty,
      { from: owner, value: stake }
    );

    const count = await app.taskCount();
    assert.equal(count.toNumber(), 1);

    const t = await app.tasks(1);
    assert.equal(t.owner, owner);
    assert.equal(t.content, 'Finish portfolio site');
    assert.equal(t.stake.toString(), stake);
    assert.equal(t.deadline.toNumber(), deadline);
    assert.equal(t.penaltyAddress, penalty);
    assert.equal(t.status.toNumber(), STATUS.Pending);

    const balance = await web3.eth.getBalance(app.address);
    assert.equal(balance.toString(), stake);

    const ev = result.logs[0];
    assert.equal(ev.event, 'TaskCreated');
    assert.equal(ev.args.id.toNumber(), 1);
  });

  it('rejects task creation with zero stake', async () => {
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    try {
      await app.createTask('No stake', deadline, penalty, { from: owner, value: 0 });
      assert.fail('expected revert');
    } catch (err) {
      assert.match(err.message, /Must stake ETH/);
    }
  });

  it('rejects past deadlines', async () => {
    const stake = web3.utils.toWei('0.001', 'ether');
    const deadline = Math.floor(Date.now() / 1000) - 60;
    try {
      await app.createTask('Already late', deadline, penalty, { from: owner, value: stake });
      assert.fail('expected revert');
    } catch (err) {
      assert.match(err.message, /Deadline must be in the future/);
    }
  });

  it('refunds the stake to the owner when the owner marks it complete before the deadline', async () => {
    const stake = web3.utils.toWei('0.05', 'ether');
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await app.createTask('Ship feature', deadline, penalty, { from: owner, value: stake });

    const ownerBefore = web3.utils.toBN(await web3.eth.getBalance(owner));
    const result = await app.verifyCompletion(1, { from: owner, gasPrice: 0 });
    const ownerAfter = web3.utils.toBN(await web3.eth.getBalance(owner));

    assert.equal(ownerAfter.sub(ownerBefore).toString(), stake);

    const t = await app.tasks(1);
    assert.equal(t.status.toNumber(), STATUS.Completed);

    const ev = result.logs[0];
    assert.equal(ev.event, 'TaskCompleted');
    assert.equal(ev.args.id.toNumber(), 1);
  });

  it('rejects verification by anyone other than the owner', async () => {
    const stake = web3.utils.toWei('0.001', 'ether');
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    await app.createTask('Solo work', deadline, penalty, { from: owner, value: stake });

    try {
      await app.verifyCompletion(1, { from: stranger });
      assert.fail('expected revert');
    } catch (err) {
      assert.match(err.message, /Only owner can mark complete/);
    }
  });

  it('sends the stake to the penalty address when claimed after the deadline', async () => {
    const stake = web3.utils.toWei('0.02', 'ether');
    const deadline = Math.floor(Date.now() / 1000) + 2;

    await app.createTask('Tight deadline', deadline, penalty, { from: owner, value: stake });

    await sleep(3500);

    const penaltyBefore = web3.utils.toBN(await web3.eth.getBalance(penalty));
    const result = await app.claimPenalty(1, { from: stranger });
    const penaltyAfter = web3.utils.toBN(await web3.eth.getBalance(penalty));

    assert.equal(penaltyAfter.sub(penaltyBefore).toString(), stake);

    const t = await app.tasks(1);
    assert.equal(t.status.toNumber(), STATUS.Failed);

    const ev = result.logs[0];
    assert.equal(ev.event, 'TaskFailed');
    assert.equal(ev.args.id.toNumber(), 1);
  });

  it('refuses to claim the penalty before the deadline', async () => {
    const stake = web3.utils.toWei('0.001', 'ether');
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    await app.createTask('Plenty of time', deadline, penalty, { from: owner, value: stake });

    try {
      await app.claimPenalty(1, { from: stranger });
      assert.fail('expected revert');
    } catch (err) {
      assert.match(err.message, /Deadline has not passed yet/);
    }
  });

  it('refuses to verify or claim once a task is resolved', async () => {
    const stake = web3.utils.toWei('0.001', 'ether');
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    await app.createTask('One-shot', deadline, penalty, { from: owner, value: stake });

    await app.verifyCompletion(1, { from: owner });

    try {
      await app.verifyCompletion(1, { from: owner });
      assert.fail('expected revert');
    } catch (err) {
      assert.match(err.message, /Task already resolved/);
    }
  });
});
