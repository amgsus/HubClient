TODO: This article needs to be filled with some documentation.

### Namespaces

For example, let the client's namespace be `Sensor_RH`. Then a channel name `Value` is relative to the specified namespace, i.e. the full path will be `Sensor_RH.Value`. When the client is configured to use namespacing feature, it attaches this value before each channel name specified for methods such as `store(channelName, ...)`, `subscribe(channelName, ...)`, etc.  

If there is a need to write to a different channel from the outside of the specified namespace (for example, `Display.Status`), the programmer can add a symbol `!` before the channel name, when passing it to the client's methods. This symbol marks the path as absolute, and the client treats it as it is.

When the client receives an update of a channel (for example, `Sensor_RH.Value`) within the specified namespace, the channel name in `update`'s event DTO is trimmed to relative one, and DTO's `namespace` field is filled with the set one. In other cases, when the client receives an update of a channel from the outside the specified namespace, the DTO's field `namespace` will be empty. The user should check for `namespace` itself when processing received update events while using client namespace feature. 

**NOTE:** When using an update event like `update:channelName`, then `channelName` is a relative name to the set namespace and equals to `id` field of `TopicNotification`. The user is responsible for checking `namespace` field by itself if there are possible matches between relative and absolute names. To suppress emiting specific events for channels outside the set namespace, the client's property `strictUpdateEvents` has to be set to `true`.

### Topic Object

A `Topic` object makes an abstraction layer between a concrete Mediator channel and user application code. This allows to publishing, subscribing, etc. to some channel without need to know the name of that channel.

Methods:
- `store(value[,ts][,callback])`
- `retrieve(value[,ts][,callback])`
- `publish(value[,ts][,callback])`
- `subscribe(callback)`
- `unsubscribe(callback)`

Properties:
- `value: any`

Usage:

```
let systemInfoChannel = client.getChannel('System.Info');
...
let data = {
    cpuName: "ARMv7",
    freq: 1500000000
};
systemInfoChannel.store(data); // Stores JSON to a channel.
```

```
roomTempChannel.subscribe((value) => {
    console.log(`Temperature in a room: ${value} C`);
});

- or -

roomTempChannel.on('update', ((value) => {
    console.log(`Temperature in a room: ${value} C`);
}));
```
