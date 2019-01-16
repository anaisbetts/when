import { materialize } from 'rxjs/operators';

import { createCollection } from '../custom-operators';
import { TestClass } from '../test-support';
import { Updatable } from '../updatable';
import { notificationForProperty, notificationForPropertyChain } from '../when-helpers';

describe('the notificationForProperty method', function() {
  it('should notify me about props', function() {
    const fixture = { foo: new TestClass() };
    const inner = fixture.foo;

    const changes = createCollection(notificationForProperty(inner, 'bar'));
    expect(changes.length).toEqual(0);

    inner.bar = 5;
    expect(changes.length).toEqual(1);
    expect(changes[0]).toEqual({sender: inner, property: 'bar', value: 5});
    expect(Object.keys(changes[0]).length).toEqual(3);

    const changes2 = createCollection(notificationForProperty(fixture, 'foo'));
    expect(changes2.length).toEqual(0);

    changes2['foo'] = new TestClass();
    expect(changes2.length).toEqual(0);
  });

  it('should return nothing for non-models', function() {
    let changes = createCollection(notificationForProperty(5, '').pipe(materialize()));

    expect(changes.length).toEqual(0);

    const input = {foo: 'bar'};
    changes = createCollection(notificationForProperty(input, '').pipe(materialize()));

    expect(changes.length).toEqual(0);

    input.foo = 'barrr';
    expect(changes.length).toEqual(0);
  });

  it.skip('should notify through Updatables', async function() {
    const input: Updatable<TestClass> = new Updatable(() => Promise.resolve(new TestClass()));
    await input.waitForValue();

    input.value!.foo = 4;

    const changes = createCollection(notificationForProperty(input, 'foo'));
    const updates = createCollection(input);
    expect(changes.length).toBe(0);
    expect(updates.length).toBe(1);

    input.value!.foo = 17;
    expect(changes.length).toBe(1);
    expect(updates.length).toBe(1);

    input.next(new TestClass());
    expect(changes.length).toBe(2);
    expect(updates.length).toBe(2);

    input.next(new TestClass());
    expect(changes.length).toBe(3);
    expect(updates.length).toBe(3);

    input.value!.foo = 17;
    expect(changes.length).toBe(4);
    expect(updates.length).toBe(3);
  });
});

describe('the notificationForPropertyChain method', function() {
  it('should notify me about props', function() {
    const fixture = { foo: new TestClass() };
    const inner = fixture.foo;

    const changes = createCollection(notificationForPropertyChain(inner, ['bar']));
    expect(changes.length).toEqual(0);

    inner.bar = 5;
    expect(changes.length).toEqual(1);
    expect(changes[0]).toEqual({sender: inner, property: 'bar', value: 5});
    expect(Object.keys(changes[0]).length).toEqual(3);

    const changes2 = createCollection(notificationForPropertyChain(fixture, ['foo']));
    expect(changes2.length).toEqual(0);

    changes2['foo'] = new TestClass();
    expect(changes2.length).toEqual(0);
  });

  it('should return nothing for non-models', function() {
    let changes = createCollection(notificationForPropertyChain(5, ['']).pipe(materialize()));

    expect(changes.length).toEqual(0);

    const input = {foo: 'bar'};
    changes = createCollection(notificationForPropertyChain(input, ['']).pipe(materialize()));

    expect(changes.length).toEqual(0);

    input.foo = 'barrr';
    expect(changes.length).toEqual(0);
  });

  it.skip('should notify through Updatables', async function() {
    const input: Updatable<TestClass> = new Updatable(() => Promise.resolve(new TestClass()));
    await input.waitForValue();

    input.value!.foo = 4;

    const changes = createCollection(notificationForPropertyChain(input, ['foo']));
    const updates = createCollection(input);
    expect(changes.length).toBe(0);
    expect(updates.length).toBe(1);

    input.value!.foo = 17;
    expect(changes.length).toBe(1);
    expect(updates.length).toBe(1);

    input.next(new TestClass());
    expect(changes.length).toBe(2);
    expect(updates.length).toBe(2);

    input.next(new TestClass());
    expect(changes.length).toBe(3);
    expect(updates.length).toBe(3);

    input.value!.foo = 17;
    expect(changes.length).toBe(4);
    expect(updates.length).toBe(3);
  });

  it.skip('should notify deeply through Updatables without value', function() {
    const fixture = new TestClass();
    const result = createCollection(notificationForPropertyChain(fixture, ['updatableTodo', 'title']));
    const updatableResult = createCollection(fixture.updatableTodo);

    expect(result.length).toEqual(0);
    expect(updatableResult.length).toEqual(1);

    fixture.updatableTodo.next({ title: 'foo', description: 'bar', completed: false });

    expect(updatableResult.length).toEqual(2);
    expect(result.length).toEqual(1);
    expect(result[0]).toEqual('foo');
  });

  it.skip('should notify deeply through Updatables with value', function() {
    const fixture = new TestClass();
    const result = createCollection(notificationForPropertyChain(fixture, ['updatableTodo', 'value', 'title']));
    const updatableResult = createCollection(fixture.updatableTodo);

    expect(result.length).toEqual(0);
    expect(updatableResult.length).toEqual(1);

    fixture.updatableTodo.next({ title: 'foo', description: 'bar', completed: false });

    expect(updatableResult.length).toEqual(2);
    expect(result.length).toEqual(1);
    expect(result[0]).toEqual('foo');
  });
});
