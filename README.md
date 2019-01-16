# When: React to Changes to State Objects

When lets you listen to State objects (or really, any object you want!) and act based on when they change. The main function to do this is a function called `when`:

## when(object, selector): Observable

```js
latestBar: Observable<string> = when(myCoolState, x => x.foo.bar);

// Get notifications when the result of myCoolState.foo.bar changes
latestBar.subscribe(x => console.log(`myCoolState.foo.bar is ${x}`));

myCoolState.foo.bar = "baz";
>>> myCoolState.foo.bar is baz
```

When isn't fooled by intermediate objects, and automatically listens to the right one:

```js
latestBar: Observable<string> = when(myCoolState, x => x.foo.bar);

// Whenever you initially subscribe, you get the current value - this usually
// makes your life easier
latestBar.subscribe(x => console.log(`myCoolState.foo.bar is ${x}`));
>>> myCoolState.foo.bar is bamf

oldFoo = myCoolState.foo;
myCoolState.foo = new FooObject();

oldFoo.bar = "baz";
>>> (nothing is printed)

myCoolState.foo.bar = "bamf";
>>> myCoolState.foo.bar is baz
```

## How can it do this?

When isn't magic, it will try to detect different kinds of observable objects and subscribe to them, but you will probably have to make your main object a subclass of the `Model` class. This class doesn't do much other than allow you to provide a list of properties that should notify when you change them.

```js
class Toaster : Model {
  toastCount: int;
  brandName: string;

  constructor() {
    notifyFor(this, x => x.toastCount);
  }
}

// Observing properties with notifyFor == works!
when(someToaster.toastCount).filter(x => x > 0).subscribe("Toast is happening!");
someToaster.toastCount++;
>> Toast is Happening

when(someToaster.brandName).skip(1).subscribe("My toaster has been acquired!");
someToaster.brandName = "Cuisinart";
>> (Nothing happened!)
```