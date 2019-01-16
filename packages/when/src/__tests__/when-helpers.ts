import { materialize } from 'rxjs/operators';

import { createCollection } from '../custom-operators';
import { TestClass } from '../test-support';
import { notificationForProperty } from '../when-helpers';

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
});
