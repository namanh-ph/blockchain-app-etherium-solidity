var App = {
  contracts: {},
  loading: false,
  account: [],
  STATUS: ['Pending', 'Completed', 'Failed'],
  ADDR_RE: /^0x[a-fA-F0-9]{40}$/,
  alertSeq: 0,

  load: async () => {
    await App.loadWeb3();
    await App.loadAccounts();
    await App.loadContract();
    App.bindUI();
    await App.render();
    App.watchAccountChanges();
  },

  loadWeb3: async () => {
    if (window.ethereum) {
      window.web3 = new Web3(window.ethereum);
    } else if (window.web3) {
      window.web3 = new Web3(window.web3.currentProvider);
    } else {
      App.toast('error', 'No wallet detected', 'Install MetaMask to continue.');
    }
  },

  connectWallet: async () => {
    if (!window.ethereum) {
      App.toast('error', 'No wallet detected', 'Install MetaMask to continue.');
      return;
    }
    try {
      App.account = await window.ethereum.request({ method: 'eth_requestAccounts' });
      App.renderAccount();
      App.renderWalletBanner();
      await App.render();
      App.toast('success', 'Wallet connected', 'You can create a commitment now.');
    } catch (err) {
      if (err && err.code === 4001) {
        App.toast('info', 'Connection cancelled', 'You can connect any time from the top right.');
      } else {
        App.toast('error', 'Could not connect wallet', App.cleanError(err));
      }
    }
  },

  loadAccounts: async () => {
    if (window.ethereum) {
      try {
        App.account = await window.ethereum.request({ method: 'eth_accounts' });
      } catch (e) {
        App.account = [];
      }
    } else {
      App.account = [];
    }
  },

  loadContract: async () => {
    const artifact = await fetch('TaskCommitment.json').then((r) => r.json());
    App.contracts.TaskCommitment = TruffleContract(artifact);
    App.contracts.TaskCommitment.setProvider(new Web3.providers.HttpProvider('http://127.0.0.1:7545'));
    App.taskCommitment = await App.contracts.TaskCommitment.deployed();
  },

  watchAccountChanges: () => {
    if (!window.ethereum || !window.ethereum.on) return;
    window.ethereum.on('accountsChanged', async (accounts) => {
      App.account = accounts || [];
      App.renderAccount();
      App.renderWalletBanner();
      await App.render();
    });
    window.ethereum.on('chainChanged', () => window.location.reload());
  },

  bindUI: () => {
    document.getElementById('commitForm').addEventListener('submit', (e) => {
      e.preventDefault();
      App.createTask();
    });
    document.getElementById('walletBtn').addEventListener('click', App.handleWalletClick);
    document.getElementById('bannerConnect').addEventListener('click', App.connectWallet);

    const scrollToForm = () => {
      document.getElementById('formSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
      const first = document.getElementById('newTask');
      if (first) setTimeout(() => first.focus({ preventScroll: true }), 350);
    };
    document.getElementById('ctaCreate').addEventListener('click', scrollToForm);
    const emptyCreate = document.getElementById('emptyCreate');
    if (emptyCreate) emptyCreate.addEventListener('click', scrollToForm);

    document.getElementById('ctaHow').addEventListener('click', () => {
      document.getElementById('howItWorks').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    ['newTask', 'taskDeadline', 'taskStake', 'taskPenalty'].forEach((id) => {
      const el = document.getElementById(id);
      el.addEventListener('input', () => App.clearFieldError(el));
    });
  },

  handleWalletClick: () => {
    if (App.account[0]) {
      App.copyAddress(App.account[0]);
    } else {
      App.connectWallet();
    }
  },

  copyAddress: async (addr) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(addr);
      } else {
        const ta = document.createElement('textarea');
        ta.value = addr;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      App.toast('success', 'Address copied', addr);
    } catch (err) {
      App.toast('error', 'Could not copy', 'Your browser blocked clipboard access.');
    }
  },

  renderAccount: () => {
    const btn = document.getElementById('walletBtn');
    const acc = App.account[0];
    if (acc) {
      btn.classList.remove('btn-secondary', 'btn-sm');
      btn.classList.add('account-pill');
      btn.disabled = false;
      btn.innerHTML = `
        <span class="dot" aria-hidden="true"></span>
        <span>${App.shortAddress(acc)}</span>
        <svg class="icon-sm copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>
      `;
      btn.title = 'Click to copy ' + acc;
      btn.setAttribute('aria-label', 'Copy wallet address ' + acc);
    } else {
      btn.classList.remove('account-pill');
      btn.classList.add('btn-secondary', 'btn-sm');
      btn.disabled = false;
      btn.innerHTML = `
        <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12V8a2 2 0 0 0-2-2H5a2 2 0 1 1 0-4h14"/><path d="M3 6v12a2 2 0 0 0 2 2h16v-4"/><circle cx="17" cy="14" r="1.5"/></svg>
        <span id="walletLabel">Connect wallet</span>
      `;
      btn.title = '';
      btn.setAttribute('aria-label', 'Connect wallet');
    }
  },

  renderWalletBanner: () => {
    const banner = document.getElementById('walletBanner');
    const submit = document.getElementById('submitBtn');
    if (App.account[0]) {
      banner.style.display = 'none';
      submit.disabled = false;
    } else {
      banner.style.display = 'flex';
      submit.disabled = true;
    }
  },

  render: async () => {
    if (App.loading) return;
    App.setLoading(true);
    App.renderAccount();
    App.renderWalletBanner();
    await App.renderTasks();
    App.setLoading(false);
  },

  renderTasks: async () => {
    const lists = {
      pending: document.getElementById('pendingList'),
      completed: document.getElementById('completedList'),
      failed: document.getElementById('failedList'),
    };
    Object.values(lists).forEach((el) => (el.innerHTML = ''));

    const taskCount = (await App.taskCommitment.taskCount()).toNumber();
    const me = (App.account[0] || '').toLowerCase();
    const nowSec = Math.floor(Date.now() / 1000);

    let activeCount = 0,
      completedCount = 0,
      failedCount = 0;
    let totalStakedWei = web3.toBigNumber(0);

    for (let i = 1; i <= taskCount; i++) {
      const t = await App.taskCommitment.tasks(i);
      const id = t[0].toNumber();
      const owner = t[1];
      const content = t[2];
      const stakeWei = t[3];
      const deadline = t[4].toNumber();
      const penaltyAddress = t[5];
      const status = t[6].toNumber();

      if (status === 0) {
        activeCount++;
        totalStakedWei = totalStakedWei.plus(stakeWei);
      } else if (status === 1) {
        completedCount++;
      } else {
        failedCount++;
      }

      const card = App.buildTaskCard({
        id, owner, content, stakeWei, deadline, penaltyAddress, status, me, nowSec,
      });

      if (status === 0) lists.pending.appendChild(card);
      else if (status === 1) lists.completed.appendChild(card);
      else lists.failed.appendChild(card);
    }

    document.getElementById('metricActive').textContent = activeCount;
    document.getElementById('metricStaked').textContent = web3.fromWei(totalStakedWei, 'ether').toString();
    document.getElementById('metricCompleted').textContent = completedCount;
    document.getElementById('metricFailed').textContent = failedCount;

    App.updateSection('pending', activeCount);
    App.updateSection('completed', completedCount);
    App.updateSection('failed', failedCount);

    const dashboardEmpty = document.getElementById('dashboardEmpty');
    const taskSections = document.querySelectorAll('.task-section');
    if (taskCount === 0) {
      dashboardEmpty.style.display = 'block';
      taskSections.forEach((s) => (s.style.display = 'none'));
    } else {
      dashboardEmpty.style.display = 'none';
      taskSections.forEach((s) => (s.style.display = ''));
    }
  },

  updateSection: (key, count) => {
    const map = {
      pending: ['pendingCount', 'pendingEmpty', 'pendingList'],
      completed: ['completedCount', 'completedEmpty', 'completedList'],
      failed: ['failedCount', 'failedEmpty', 'failedList'],
    };
    const [countId, emptyId, listId] = map[key];
    document.getElementById(countId).textContent = count;
    document.getElementById(emptyId).style.display = count === 0 ? 'block' : 'none';
    document.getElementById(listId).style.display = count === 0 ? 'none' : 'grid';
  },

  buildTaskCard: ({ id, owner, content, stakeWei, deadline, penaltyAddress, status, me, nowSec }) => {
    const stakeEth = web3.fromWei(stakeWei.toString(), 'ether').toString();
    const deadlineStr = new Date(deadline * 1000).toLocaleString();
    const overdue = nowSec > deadline;
    const isOwner = owner.toLowerCase() === me;
    const statusName = App.STATUS[status] || 'Unknown';
    const badgeClass = statusName.toLowerCase();
    const deadlineClass = status === 0 && overdue ? 'overdue' : '';

    const card = document.createElement('div');
    card.className = 'task-card';
    card.innerHTML = `
      <div class="title-row">
        <p class="content"></p>
        <span class="badge ${badgeClass}">${statusName}</span>
      </div>
      <div class="stake-line">
        <div><span class="stake-amount">${stakeEth} ETH</span> staked</div>
        <div class="deadline ${deadlineClass}">
          <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          <span>${overdue && status === 0 ? 'Overdue, ' : ''}${deadlineStr}</span>
        </div>
      </div>
      <div class="meta meta-owner"><strong>Owner</strong></div>
      <div class="meta meta-penalty"><strong>Backup</strong></div>
      <div class="actions"></div>
    `;
    card.querySelector('.content').textContent = content;

    const ownerEl = card.querySelector('.meta-owner');
    ownerEl.append(App.shortAddress(owner));
    ownerEl.title = owner;

    const penaltyEl = card.querySelector('.meta-penalty');
    penaltyEl.append(App.shortAddress(penaltyAddress));
    penaltyEl.title = penaltyAddress;

    const actions = card.querySelector('.actions');
    if (status === 0) {
      if (isOwner && !overdue) {
        const btn = document.createElement('button');
        btn.className = 'btn-success btn-sm';
        btn.innerHTML = '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg><span>Mark as done</span>';
        btn.addEventListener('click', () => App.verifyCompletion(id, btn));
        actions.appendChild(btn);
      }
      if (overdue) {
        const btn = document.createElement('button');
        btn.className = 'btn-danger btn-sm';
        btn.innerHTML = '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg><span>Send stake to backup wallet</span>';
        btn.addEventListener('click', () => App.claimPenalty(id, btn));
        actions.appendChild(btn);
      }
      if (!isOwner && !overdue) {
        const note = document.createElement('span');
        note.className = 'waiting';
        note.innerHTML = '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span>Waiting for the owner to mark it done</span>';
        actions.appendChild(note);
      }
    }
    return card;
  },

  setLoading: (v) => {
    App.loading = v;
    document.getElementById('loader').style.display = v ? 'flex' : 'none';
    document.getElementById('content').style.display = v ? 'none' : 'block';
  },

  setSubmitting: (btn, label, isLoading) => {
    if (!btn) return;
    if (isLoading) {
      if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
      btn.innerHTML = `<span class="spinner inline" aria-hidden="true"></span><span>${label}</span>`;
      btn.disabled = true;
    } else {
      if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
      delete btn.dataset.originalHtml;
      btn.disabled = false;
    }
  },

  validateForm: () => {
    let ok = true;
    const me = (App.account[0] || '').toLowerCase();

    const content = document.getElementById('newTask').value.trim();
    ok = App.flagField('newTask', content.length > 0) && ok;

    const deadlineLocal = document.getElementById('taskDeadline').value;
    const deadlineSec = deadlineLocal ? Math.floor(new Date(deadlineLocal).getTime() / 1000) : 0;
    ok = App.flagField('taskDeadline', deadlineLocal && deadlineSec > Math.floor(Date.now() / 1000)) && ok;

    const stake = document.getElementById('taskStake').value;
    ok = App.flagField('taskStake', stake && parseFloat(stake) > 0) && ok;

    const penalty = document.getElementById('taskPenalty').value.trim();
    ok = App.flagField('taskPenalty', App.ADDR_RE.test(penalty) && penalty.toLowerCase() !== me) && ok;

    return { ok, content, deadlineSec, stake, penalty };
  },

  flagField: (id, valid) => {
    const el = document.getElementById(id);
    const field = el.closest('.field');
    if (valid) {
      el.classList.remove('invalid');
      field.classList.remove('has-error');
    } else {
      el.classList.add('invalid');
      field.classList.add('has-error');
    }
    return !!valid;
  },

  clearFieldError: (el) => {
    el.classList.remove('invalid');
    el.closest('.field').classList.remove('has-error');
  },

  createTask: async () => {
    if (!App.account[0]) {
      App.toast('error', 'Wallet not connected', 'Connect MetaMask before creating a commitment.');
      return;
    }
    const v = App.validateForm();
    if (!v.ok) {
      App.toast('error', 'Check the form', 'Some fields are missing or invalid.');
      return;
    }

    const submitBtn = document.getElementById('submitBtn');
    App.setSubmitting(submitBtn, 'Confirming in your wallet', true);
    const pendingId = App.toast('pending', 'Waiting for your confirmation', 'Approve the transaction in MetaMask to lock your stake.', { sticky: true });

    try {
      const stakeWei = web3.toWei(v.stake, 'ether');
      const promise = App.taskCommitment.createTask(
        v.content, v.deadlineSec, v.penalty,
        { from: App.account[0], value: stakeWei, gas: 400000 }
      );

      App.attachHashListener(promise, pendingId, submitBtn);

      const result = await promise;
      App.dismissAlert(pendingId);
      App.toast('success', 'Commitment created', `Your stake is locked. Tx <code>${App.shortHash(result.tx)}</code>`);
      document.getElementById('commitForm').reset();
      await App.render();
    } catch (err) {
      App.dismissAlert(pendingId);
      App.handleTxError(err);
    } finally {
      App.setSubmitting(submitBtn, '', false);
    }
  },

  verifyCompletion: async (id, btn) => {
    App.setSubmitting(btn, 'Confirming', true);
    const pendingId = App.toast('pending', 'Waiting for your confirmation', 'Approve marking this goal done in MetaMask.', { sticky: true });
    try {
      const promise = App.taskCommitment.verifyCompletion(id, { from: App.account[0], gas: 200000 });
      App.attachHashListener(promise, pendingId);
      const result = await promise;
      App.dismissAlert(pendingId);
      App.toast('success', 'Goal completed', `Stake refunded. Tx <code>${App.shortHash(result.tx)}</code>`);
      await App.render();
    } catch (err) {
      App.dismissAlert(pendingId);
      App.handleTxError(err);
      App.setSubmitting(btn, '', false);
    }
  },

  claimPenalty: async (id, btn) => {
    App.setSubmitting(btn, 'Confirming', true);
    const pendingId = App.toast('pending', 'Waiting for your confirmation', 'Approve the payout in MetaMask.', { sticky: true });
    try {
      const promise = App.taskCommitment.claimPenalty(id, { from: App.account[0], gas: 200000 });
      App.attachHashListener(promise, pendingId);
      const result = await promise;
      App.dismissAlert(pendingId);
      App.toast('success', 'Stake sent to backup wallet', `Tx <code>${App.shortHash(result.tx)}</code>`);
      await App.render();
    } catch (err) {
      App.dismissAlert(pendingId);
      App.handleTxError(err);
      App.setSubmitting(btn, '', false);
    }
  },

  attachHashListener: (promise, alertId, submitBtn) => {
    if (promise && typeof promise.on === 'function') {
      promise.on('transactionHash', (hash) => {
        App.updateAlert(alertId, 'pending', 'Transaction sent', `Waiting for the network to confirm. Tx <code>${App.shortHash(hash)}</code>`);
        if (submitBtn) App.setSubmitting(submitBtn, 'Sending to the network', true);
      });
    }
  },

  handleTxError: (err) => {
    if (App.isUserRejection(err)) {
      App.toast('info', 'Transaction cancelled', 'You cancelled in your wallet. No ETH was moved.');
    } else {
      App.toast('error', 'Something went wrong', App.cleanError(err));
    }
  },

  isUserRejection: (err) => {
    if (!err) return false;
    if (err.code === 4001 || err.code === 'ACTION_REJECTED') return true;
    return /user denied|user rejected|cancelled|canceled/i.test(err.message || '');
  },

  /* Alerts */

  toast: (kind, title, message, opts = {}) => {
    const id = 'alert-' + ++App.alertSeq;
    const wrap = document.getElementById('alerts');
    const el = document.createElement('div');
    el.className = `alert ${kind}`;
    el.id = id;
    const icon = kind === 'pending' ? '<div class="spinner" aria-hidden="true"></div>' : '';
    el.innerHTML = `
      ${icon}
      <div class="alert-body">
        <div class="alert-title"></div>
        <div class="alert-msg"></div>
      </div>
      <button class="close" aria-label="Dismiss">&times;</button>
    `;
    el.querySelector('.alert-title').textContent = title;
    el.querySelector('.alert-msg').innerHTML = message;
    el.querySelector('.close').addEventListener('click', () => App.dismissAlert(id));
    wrap.appendChild(el);
    if (!opts.sticky && kind !== 'pending') {
      const ttl = kind === 'error' ? 8000 : 5500;
      setTimeout(() => App.dismissAlert(id), ttl);
    }
    return id;
  },

  updateAlert: (id, kind, title, message) => {
    const el = document.getElementById(id);
    if (!el) return;
    const hasSpinner = el.querySelector('.spinner');
    el.className = `alert ${kind}`;
    if (kind === 'pending' && !hasSpinner) {
      const sp = document.createElement('div');
      sp.className = 'spinner';
      sp.setAttribute('aria-hidden', 'true');
      el.prepend(sp);
    } else if (kind !== 'pending' && hasSpinner) {
      hasSpinner.remove();
    }
    el.querySelector('.alert-title').textContent = title;
    el.querySelector('.alert-msg').innerHTML = message;
  },

  dismissAlert: (id) => {
    const el = document.getElementById(id);
    if (el) el.remove();
  },

  /* Formatting */

  shortAddress: (a) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : ''),
  shortHash: (h) => (h ? `${h.slice(0, 10)}...${h.slice(-6)}` : ''),
  cleanError: (err) => {
    const msg = (err && err.message) || String(err);
    const m = msg.match(/revert(?:ed)?(?: with reason string)?[: ]+["']?([^"']+)["']?/i);
    if (m) return m[1];
    if (/insufficient funds/i.test(msg)) return 'Not enough ETH in your wallet to cover the stake plus gas.';
    return msg.length > 200 ? msg.slice(0, 200) + '...' : msg;
  },
};

window.addEventListener('load', () => App.load());
