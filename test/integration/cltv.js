/* global describe, it */

var assert = require('assert')
var swiftcash = require('../../')
var testnetUtils = require('./_testnet')

var testnet = swiftcash.networks.testnet
var alice = swiftcash.ECPair.fromWIF('cScfkGjbzzoeewVWmU2hYPUHeVGJRDdFt7WhmrVVGkxpmPP8BHWe', testnet)
var bob = swiftcash.ECPair.fromWIF('cMkopUXKWsEzAjfa1zApksGRwjVpJRB3831qM9W4gKZsLwjHXA9x', testnet)

describe('swiftcashjs-lib (transactions w/ CLTV)', function () {
  var hashType = swiftcash.Transaction.SIGHASH_ALL

  // IF MTP > utcSeconds, aQ can redeem, ELSE bQ, aQ joint redeem
  function cltvCheckSigOutput (aQ, bQ, utcSeconds) {
    return swiftcash.script.compile([
      swiftcash.opcodes.OP_IF,
      swiftcash.script.number.encode(utcSeconds),
      swiftcash.opcodes.OP_CHECKLOCKTIMEVERIFY,
      swiftcash.opcodes.OP_DROP,

      swiftcash.opcodes.OP_ELSE,
      bQ.getPublicKeyBuffer(),
      swiftcash.opcodes.OP_CHECKSIGVERIFY,
      swiftcash.opcodes.OP_ENDIF,

      aQ.getPublicKeyBuffer(),
      swiftcash.opcodes.OP_CHECKSIG
    ])
  }

  function utcNow () {
    return Math.floor(Date.now() / 1000)
  }

  // expiry past, {Alice's signature} OP_TRUE
  it('can create (and broadcast via 3PBP) a Transaction where Alice can redeem the output after the expiry', function (done) {
    this.timeout(30000)

    // three hours ago
    var timeUtc = utcNow() - (3600 * 3)
    var redeemScript = cltvCheckSigOutput(alice, bob, timeUtc)
    var scriptPubKey = swiftcash.script.scriptHash.output.encode(swiftcash.crypto.hash160(redeemScript))
    var address = swiftcash.address.fromOutputScript(scriptPubKey, testnet)

    // fund the P2SH(CLTV) address
    testnetUtils.faucet(address, 2e4, function (err, unspent) {
      if (err) return done(err)

      var tx = new swiftcash.TransactionBuilder(testnet)
      tx.setLockTime(timeUtc)
      tx.addInput(unspent.txId, 0, 0xfffffffe)
      tx.addOutput(testnetUtils.RETURN_ADDRESS, 1e4)

      var txRaw = tx.buildIncomplete()
      var signatureHash = txRaw.hashForSignature(0, redeemScript, hashType)

      // {Alice's signature} OP_TRUE
      var redeemScriptSig = swiftcash.script.scriptHash.input.encode([
        alice.sign(signatureHash).toScriptSignature(hashType),
        swiftcash.opcodes.OP_TRUE
      ], redeemScript)

      txRaw.setInputScript(0, redeemScriptSig)

      testnetUtils.transactions.propagate(txRaw.toHex(), done)
    })
  })

  // expiry ignored, {Bob's signature} {Alice's signature} OP_FALSE
  it('can create (and broadcast via 3PBP) a Transaction where Alice and Bob can redeem the output at any time', function (done) {
    this.timeout(30000)

    // two hours ago
    var timeUtc = utcNow() - (3600 * 2)
    var redeemScript = cltvCheckSigOutput(alice, bob, timeUtc)
    var scriptPubKey = swiftcash.script.scriptHash.output.encode(swiftcash.crypto.hash160(redeemScript))
    var address = swiftcash.address.fromOutputScript(scriptPubKey, testnet)

    // fund the P2SH(CLTV) address
    testnetUtils.faucet(address, 2e4, function (err, unspent) {
      if (err) return done(err)

      var tx = new swiftcash.TransactionBuilder(testnet)
      tx.setLockTime(timeUtc)
      tx.addInput(unspent.txId, 0, 0xfffffffe)
      tx.addOutput(testnetUtils.RETURN_ADDRESS, 1e4)

      var txRaw = tx.buildIncomplete()
      var signatureHash = txRaw.hashForSignature(0, redeemScript, hashType)
      var redeemScriptSig = swiftcash.script.scriptHash.input.encode([
        alice.sign(signatureHash).toScriptSignature(hashType),
        bob.sign(signatureHash).toScriptSignature(hashType),
        swiftcash.opcodes.OP_FALSE
      ], redeemScript)

      txRaw.setInputScript(0, redeemScriptSig)

      testnetUtils.transactions.propagate(txRaw.toHex(), done)
    })
  })

  // expiry in the future, {Alice's signature} OP_TRUE
  it('can create (but fail to broadcast via 3PBP) a Transaction where Alice attempts to redeem before the expiry', function (done) {
    this.timeout(30000)

    // two hours from now
    var timeUtc = utcNow() + (3600 * 2)
    var redeemScript = cltvCheckSigOutput(alice, bob, timeUtc)
    var scriptPubKey = swiftcash.script.scriptHash.output.encode(swiftcash.crypto.hash160(redeemScript))
    var address = swiftcash.address.fromOutputScript(scriptPubKey, testnet)

    // fund the P2SH(CLTV) address
    testnetUtils.faucet(address, 2e4, function (err, unspent) {
      if (err) return done(err)

      var tx = new swiftcash.TransactionBuilder(testnet)
      tx.setLockTime(timeUtc)
      tx.addInput(unspent.txId, 0, 0xfffffffe)
      tx.addOutput(testnetUtils.RETURN_ADDRESS, 1e4)

      var txRaw = tx.buildIncomplete()
      var signatureHash = txRaw.hashForSignature(0, redeemScript, hashType)

      // {Alice's signature} OP_TRUE
      var redeemScriptSig = swiftcash.script.scriptHash.input.encode([
        alice.sign(signatureHash).toScriptSignature(hashType),
        swiftcash.opcodes.OP_TRUE
      ], redeemScript)

      txRaw.setInputScript(0, redeemScriptSig)

      testnetUtils.transactions.propagate(txRaw.toHex(), function (err) {
        assert.throws(function () {
          if (err) throw err
        }, /Error: 64: non-final/)

        done()
      })
    })
  })
})
