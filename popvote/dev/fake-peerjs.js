// Minimal fake PeerJS, API-compatible with how popvote/index.html uses it.
// Lets host+guest talk to each other via an in-memory bridge instead of real
// WebRTC/signaling (this sandbox's HTTP-CONNECT-only proxy cannot carry
// WebSocket signaling or raw UDP ICE traffic, so real PeerJS Cloud is
// unreachable here — this is a network-layer test double, not a product
// shortcut; see popvote/HANDOFF.md for the real-network caveat).
(function(){
  const NET = (window.top.__PV_NET = window.top.__PV_NET || { peers: new Map() });

  function EE(){ this._h = {}; }
  EE.prototype.on = function(evt, cb){ (this._h[evt] = this._h[evt] || []).push(cb); };
  EE.prototype.emit = function(evt, ...args){ (this._h[evt] || []).slice().forEach(cb => { try{ cb(...args); }catch(e){ console.error(e); } }); };

  class FakeConn extends EE {
    constructor(peer, peerId, opts){
      super();
      this.peer = peerId;      // remote peer id (PeerJS DataConnection API)
      this._localPeer = peer;
      this.open = false;
      this.metadata = opts && opts.metadata;
    }
    send(data){ if (!this.open || !this._remote) return; setTimeout(() => this._remote.emit("data", data), 0); }
    close(){ if (!this.open) return; this.open = false; setTimeout(() => this.emit("close"), 0); if (this._remote && this._remote.open){ this._remote.open = false; setTimeout(() => this._remote.emit("close"), 0); } }
  }

  class FakePeer extends EE {
    constructor(id, opts){
      super();
      this.id = id || ("guest-" + Math.random().toString(36).slice(2, 10));
      this.destroyed = false;
      this.disconnected = false;
      if (NET.peers.has(this.id)){
        setTimeout(() => this.emit("error", { type: "unavailable-id", message: "ID taken" }), 0);
        return;
      }
      NET.peers.set(this.id, this);
      setTimeout(() => this.emit("open", this.id), 0);
    }
    connect(remoteId, opts){
      const localConn = new FakeConn(this, remoteId, opts);
      const remotePeer = NET.peers.get(remoteId);
      if (!remotePeer){
        setTimeout(() => this.emit("error", { type: "peer-unavailable", message: "not found" }), 0);
        return localConn;
      }
      const remoteConn = new FakeConn(remotePeer, this.id, opts);
      localConn._remote = remoteConn; remoteConn._remote = localConn;
      setTimeout(() => {
        localConn.open = true; remoteConn.open = true;
        remotePeer.emit("connection", remoteConn);
        remoteConn.emit("open");
        localConn.emit("open");
      }, 0);
      return localConn;
    }
    reconnect(){ this.disconnected = false; }
    destroy(){ this.destroyed = true; NET.peers.delete(this.id); }
  }

  window.Peer = FakePeer;
})();
