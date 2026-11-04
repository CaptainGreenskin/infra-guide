"""Original practice implementation for the public max-stack question type.
Contract: Python integers (excluding bool); empty operations raise IndexError.
"""
class MaxStack:
    def __init__(self):
        self._items = []

    def push(self, value):
        if type(value) is not int:
            raise ValueError('integer required')
        greatest = max(value, self._items[-1][1]) if self._items else value
        self._items.append((value, greatest))

    def pop(self):
        return self._items.pop()[0]

    def maximum(self):
        return self._items[-1][1]


def verify():
    stack = MaxStack()
    for value in (-3, 7, 7, 2):
        stack.push(value)
    assert stack.maximum() == 7
    assert stack.pop() == 2
    assert stack.pop() == 7
    assert stack.maximum() == 7  # Repeated maximum must survive one removal.
    assert stack.pop() == 7
    assert stack.maximum() == -3
    assert stack.pop() == -3
    for method in (stack.pop, stack.maximum):
        try:
            method()
            raise AssertionError('empty operation accepted')
        except IndexError:
            pass
    try:
        stack.push(True)
        raise AssertionError('bool accepted')
    except ValueError:
        pass
    print('PASS: duplicate maxima, negative values, empty operations and input contract')

if __name__ == '__main__':
    verify()
