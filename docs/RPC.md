# Hub Client

## RPC

**RPC** is standing as **R**emote **P**rocedure **C**all and provides a 
mechanism to invoke pre-defined tasks on a remote client and retrieving the 
result of them.

A soon as a client is connected to the Hub, it should provide a list of RPCs 
that he publishes to other connected clients. The list is not sent to all 
clients, but Hub consumes it and registers notification handlers. 

The default timeout for task resolution is 5000 ms.

An example of client's request to invoke `Sum` procedure:

`#rpc=Sum 1 2 3`

The payload RPC packet entries are split by space (ASCII 32) character. If the 
space character contained within a parameter, the parameter must be wrapped 
into double quotes. For example:

`#rpc=Say "Hello, World!"`

but:

`#rpc=Say Hello`

Error codes:
- `RPC_SUCCESS` - successful call.
- `RPC_ERR_EXCEPTION` - ...
- `RPC_ERR_CONNECTION_LOST` - client connection lost (emitted locally).
- `RPC_ERR_PROVIDER_DISCONNECTED` - provider went offline while waiting for response.
- `RPC_ERR_NO_SUCH_PROCEDURE` - procedure with such name does not registered.
- `RPC_ERR_TIMEOUT` - response wait local timeout.
- `RPC_ERR_PARAMETERS` - invalid parameters provided (response from provider).
- `RPC_ERR_REMOTE_TIMEOUT` - response wait timeout on server-side.
- `RPC_ERR_UNKNOWN` - any other faulty situation not listed above.



#### RPC Event Handling

When a client (A) requests an invocation of a procedure, the server relays the 
RPC request to the provider - a client (B) that has registered a handler (by 
procedure name).

The server sends the request in the following format:

`#rpc=<tag> <procedure_name> <arg0> <arg1> ...`

When the provider (client B) receives such packet, it triggers an event and 
passes the arguments and a callback function that resolves this RPC transaction, 
i.e. used as "return" operator. The provider can postpone RPC handling. 
But keep in mind that every RPC request is guarded with several timeouts: the 
one is at the caller's side, and the second one is at the server side. The 
timeout on the server-side is used to collect "hanged" transaction, when the 
provider does not resolve it.

The provider sends a result in the following format:

`#result=<tag> <result> <operand>`

Examples: 

`#result=X3wc0 404`

`#result=23208237 200 42`

`#result=goK 200 '{\"msg\":\"Hello, world!\"}'`

Note: that a result can be specified as only one parameter. To combine multiple 
values, some encoding method can be used (for example, JSON or a comma-separated string).

The `tag` and `result` fields are mandatory; `operand` is optional, and its 
usage is defined by end-developer.

#### Special Character Escaping

Arguments.

Result.

#### Result Codes

- `200` - success.
- `400` - bad parameters.
- `404` - no such procedure.
- `500` - any error occurred on the server-side and not mentioned here.
- `501` - RPC was accepted by provider, but not handled.
- `502` - any timeout.
- `503` - RPC is disabled on this server.
